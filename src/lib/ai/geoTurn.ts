import 'server-only'
import { generateText, tool, type LanguageModel } from 'ai'
import { z } from 'zod'
import type { AssistantRequest, TurnStep } from '../assistant'
import type { NearbyPlace } from '../hotelDetails'
import { CATEGORY, PLACE_CATEGORIES, type PlaceCategory } from '../geo/categories'
import {
  MAP_ATTRIBUTION_TEXT,
  MAX_MAP_POINTS,
  distanceText,
  durationText,
  thinLine,
  type ChatMap,
  type MapPoint,
  type MapRoute,
} from '../geo/chatMap'
import { haversineMeters, type LatLon } from '../geo/distance'
import type { DriveRoute, WalkRoute } from '../geo/osrm'
import { FAR_CATEGORIES, type Geocoded, type Nearby, type NearbyGroup } from '../geo/places'
import { EVERYDAY, FAR_RADIUS_M, NEAR_RADIUS_M, questionCategories } from '../geo/questions'
import type { GeoResult } from '../geo/result'
import {
  GEOCODE_DESCRIPTION,
  NEARBY_DESCRIPTION,
  geoTools,
  newGeoSession,
  serverGeoDeps,
  type GeoDeps,
} from '../geo/tools'
import { firstAnswer, type ModelLink } from './chain'

/**
 * Эвал's geo steps in a chat about a hotel: a model of the chain chooses the calls of the geo tools (the rules do
 * without one), each call runs as a step of its own with its own time and its own line in the feed, then the routes to
 * the nearest places are built. The hotel's Ostrovok places (`ota_hotel_places`) come first, OpenStreetMap adds what
 * they do not have. What came of it are the facts for the answer, the rules' answer, the honest notes of the services
 * that failed and the map of the message. Only for a hotel with Ostrovok places or in the OSM data loaded in advance.
 */

export interface GeoHotel extends LatLon {
  name: string
}

export interface GeoOutcome {
  steps: TurnStep[]
  /** What was found, for the model's answer: the only places and distances it may name. */
  facts: string
  /** The answer by rules from the same facts. */
  summary: string
  /** What the services could not check: added to the model's answer, so it cannot be lost. */
  notes: string[]
  map?: ChatMap
}

export interface GeoTurnOptions {
  /** When the whole answer is due, ms since the epoch. */
  deadline: number
  signal: AbortSignal
  models?: readonly ModelLink[]
  deps?: GeoDeps
  /** The hotel's places of Ostrovok, the first source; OpenStreetMap adds to them. */
  ostrovok?: readonly NearbyPlace[]
  onError?: (id: string, error: unknown) => void
}

/** The model chooses the calls in this time at most. */
export const PLAN_MS = 5000
/** A call of a tool gets this much, never past the steps' deadline. */
export const STEP_MS = 4000
/** Left of the answer's time for the answer itself. */
export const ANSWER_RESERVE_MS = 3500
/** A step is not started with less than this left. */
const MIN_STEP_MS = 500
/** The calls of the model a turn runs. */
const MAX_CALLS = 3
/** The routes a turn builds: to the nearest places of the first categories asked. */
const MAX_ROUTES = 2
/** Farther than this the route is by car. */
export const WALK_MAX_M = 3000
/** The places of a category the answer and the map show. */
const SHOWN_PER_CATEGORY = 3

type Call = { tool: 'nearbyPlaces'; categories: PlaceCategory[]; radiusM: number } | { tool: 'geocode'; query: string }

const nearbyInput = z.object({
  categories: z.array(z.enum(PLACE_CATEGORIES)).min(1).max(6),
  radiusM: z.number().int().min(100).max(FAR_RADIUS_M).describe('радиус поиска от отеля, метры'),
})
const geocodeInput = z.object({ query: z.string().trim().min(2).max(200).describe('название места или адрес') })

/**
 * The tools as the model sees them to choose the calls: the point is the hotel's, so the model never makes up
 * coordinates; no `execute`, the turn runs each call as a step of its own.
 */
function planTools(descriptions: { nearby: string; geocode: string }) {
  return {
    nearbyPlaces: tool({
      description: `${descriptions.nearby} Точка — отель, её указывать не нужно.`,
      inputSchema: nearbyInput,
    }),
    geocode: tool({
      description: `${descriptions.geocode} Только когда спрашивают о конкретном месте по названию.`,
      inputSchema: geocodeInput,
    }),
  }
}

const planInstructions = (hotel: GeoHotel) =>
  [
    `Ты Эвал, помощник по отелю «${hotel.name}» в Валенсии. Выбери вызовы инструментов, чтобы ответить на последний`,
    'вопрос гостя о местах рядом с отелем или о пути до места. Больница, аптека, бар, клуб, кафе — nearbyPlaces',
    'с радиусом 1000–3000. Море — категории beach и sea. Центр города и аэропорт — радиус 20000. Конкретное место',
    `по названию — geocode. Не больше ${MAX_CALLS} вызовов.`,
  ].join(' ')

/** The calls the model chose; throws when it chose none, so the next model of the chain is asked. */
async function modelPlan(
  model: LanguageModel,
  hotel: GeoHotel,
  messages: AssistantRequest['messages'],
  tools: ReturnType<typeof planTools>,
  signal: AbortSignal,
): Promise<Call[]> {
  const { toolCalls } = await generateText({
    model,
    instructions: planInstructions(hotel),
    messages: messages.slice(-4).map(({ role, text }) => ({ role, content: text })),
    tools,
    toolChoice: 'required',
    reasoning: 'none',
    maxRetries: 0,
    abortSignal: signal,
  })
  const calls = toolCalls.flatMap((call): Call[] => {
    if (call.toolName === 'nearbyPlaces') {
      const input = nearbyInput.safeParse(call.input)
      return input.success ? [{ tool: 'nearbyPlaces', ...input.data }] : []
    }
    if (call.toolName === 'geocode') {
      const input = geocodeInput.safeParse(call.input)
      return input.success ? [{ tool: 'geocode', query: input.data.query }] : []
    }
    return []
  })
  if (calls.length === 0) throw new Error('The model chose no geo call')
  return calls
}

/** The calls by the words of the question: the near categories in a walk's radius, the far ones in 20 km. */
export function rulesPlan(text: string): Call[] {
  const named = questionCategories(text)
  const categories = named.length ? named : [...EVERYDAY]
  const near = categories.filter((c) => !FAR_CATEGORIES.includes(c))
  const far = categories.filter((c) => FAR_CATEGORIES.includes(c))
  return [
    ...(near.length ? [{ tool: 'nearbyPlaces' as const, categories: near, radiusM: NEAR_RADIUS_M }] : []),
    ...(far.length ? [{ tool: 'nearbyPlaces' as const, categories: far, radiusM: FAR_RADIUS_M }] : []),
  ]
}

/**
 * The model's calls made safe: the sea is asked with its beaches (the coastline has the port), a far category gets
 * the far radius, a call repeated is dropped, at most `MAX_CALLS`.
 */
export function tidyPlan(calls: readonly Call[]): Call[] {
  const seen = new Set<string>()
  return calls
    .map((call): Call => {
      if (call.tool !== 'nearbyPlaces') return call
      const categories = [
        ...new Set(call.categories.includes('sea') ? ['beach' as const, ...call.categories] : call.categories),
      ]
      const far = categories.some((c) => FAR_CATEGORIES.includes(c))
      return { ...call, categories: categories.slice(0, 6), radiusM: far ? FAR_RADIUS_M : call.radiusM }
    })
    .filter((call) => {
      const key = JSON.stringify(call)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_CALLS)
}

/** The kinds of the Ostrovok places (src/lib/ota/page.ts `placeKind`) as the categories of the geo tools. */
const OSTROVOK_KIND: Record<string, PlaceCategory> = {
  Аэропорт: 'airport',
  Станция: 'metro',
  Пляж: 'beach',
  Больница: 'hospital',
  Музей: 'museum',
  Парк: 'park',
  Достопримечательность: 'attraction',
}

interface OstrovokHit {
  category: PlaceCategory
  place: NearbyPlace
}

/** The Ostrovok places of the asked categories, nearest first, `SHOWN_PER_CATEGORY` of each. */
export function ostrovokHits(places: readonly NearbyPlace[], categories: readonly PlaceCategory[]): OstrovokHit[] {
  return categories.flatMap((category) =>
    places
      .filter((place) => OSTROVOK_KIND[place.kind] === category)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, SHOWN_PER_CATEGORY)
      .map((place) => ({ category, place })),
  )
}

/** The categories of the calls, in order, each once; the sea is its beaches. */
export function askedCategories(calls: readonly Call[]): PlaceCategory[] {
  const all = [...new Set(calls.flatMap((call) => (call.tool === 'nearbyPlaces' ? call.categories : [])))]
  return all.filter((c) => c !== 'sea' || !all.includes('beach'))
}

const categoryLabel = (category: PlaceCategory) => (category === 'beach' ? 'пляж (море)' : CATEGORY[category].label)

const capital = (text: string) => text.charAt(0).toLocaleUpperCase('ru') + text.slice(1)
const quoted = (name: string | null, category: PlaceCategory | 'other') =>
  name ? `«${name}»` : `${CATEGORY[category as PlaceCategory]?.label ?? 'место'} без названия`

interface Target extends LatLon {
  label: string
  /** The group it is the nearest of; none for a geocoded place. */
  category?: PlaceCategory
}

interface Routed {
  target: Target
  route: WalkRoute | DriveRoute
}

function routeLine({ target, route }: Routed): string {
  const name = `«${target.label}»`
  if (route.kind === 'straight')
    return `до ${name} по прямой ${distanceText(route.distanceM)} — маршрут не получен (${route.reason.replace(/\.$/, '')})`
  const how = route.kind === 'foot' ? 'пешком' : 'на машине'
  const traffic = route.kind === 'car' ? ' без пробок' : ''
  return `${how} до ${name}: ${distanceText(route.distanceM)}, около ${durationText(route.durationS)}${traffic}`
}

/**
 * The groups the answer shows: the sea is its nearest beach; the coastline only when no beach is near (`sea` may be
 * the port). Each category once, the first call's.
 */
export function shownGroups(groups: readonly NearbyGroup[]): NearbyGroup[] {
  const unique = groups.filter((g, i) => groups.findIndex((h) => h.category === g.category) === i)
  const beach = unique.find((g) => g.category === 'beach')
  return unique.filter((g) => g.category !== 'sea' || !beach || beach.status !== 'found')
}

function groupLine(group: NearbyGroup, radiusM: number): string {
  const label = group.category === 'beach' ? 'пляж (море)' : group.label
  if (group.status === 'unchecked')
    return `${label}: проверить не удалось — ${group.failure?.message ?? 'сервис не ответил.'}`
  if (group.status === 'none') return `${label}: в радиусе ${distanceText(radiusM)} нет`
  const places = group.places
    .slice(0, SHOWN_PER_CATEGORY)
    .map((p) => `${quoted(p.name, p.category)} — ${distanceText(p.distanceM)}`)
  return `${label}: ${places.join('; ')}`
}

/** The steps' state: what the calls found. */
interface Found {
  ostrovok: OstrovokHit[]
  groups: { group: NearbyGroup; radiusM: number }[]
  geocoded?: Geocoded['places'][number]
  failures: string[]
  routes: Routed[]
}

function facts(found: Found): string {
  const lines = [
    ...shownGroups(found.groups.map((g) => g.group)).map((group) => {
      const radiusM = found.groups.find((g) => g.group === group)?.radiusM ?? NEAR_RADIUS_M
      return `- ${groupLine(group, radiusM)}`
    }),
    ...(found.geocoded
      ? [`- ${found.geocoded.name ?? found.geocoded.displayName}: ${found.geocoded.displayName}`]
      : []),
  ]
  const routes = found.routes.map((r) => `- ${routeLine(r)}`)
  const ostrovok = found.ostrovok.map(
    ({ category, place }) => `- ${categoryLabel(category)}: «${place.name}» — ${distanceText(place.distanceM)}`,
  )
  return [
    ...(ostrovok.length ? ['Места рядом с отелем по данным Островка (первоисточник):', ...ostrovok] : []),
    'Места рядом с отелем (OpenStreetMap; расстояния по прямой от отеля):',
    ...(lines.length ? lines : ['- ничего не проверено']),
    ...(routes.length ? ['Маршруты от отеля (OSRM):', ...routes] : []),
    ...(found.failures.length ? ['Не удалось проверить:', ...found.failures.map((f) => `- ${f}`)] : []),
  ].join('\n')
}

/** The OSM groups the answer and the map show: the categories the Ostrovok places do not answer. */
const osmShown = (found: Found) =>
  shownGroups(found.groups.map((g) => g.group)).filter(
    (group) => !found.ostrovok.some((hit) => hit.category === (group.category === 'sea' ? 'beach' : group.category)),
  )

function summary(found: Found): string {
  const ostrovok = [...new Set(found.ostrovok.map((hit) => hit.category))].map((category) => {
    const { place } = found.ostrovok.find((hit) => hit.category === category)!
    const routed = found.routes.find((r) => r.target.category === category)
    const way = routed && routed.route.kind !== 'straight' ? `; ${routeLine(routed)}` : ''
    return `${capital(categoryLabel(category))}: ближайшее — «${place.name}», ${distanceText(place.distanceM)}${way}.`
  })
  const lines = osmShown(found).map((group) => {
    const radiusM = found.groups.find((g) => g.group === group)?.radiusM ?? NEAR_RADIUS_M
    const label = capital(group.category === 'beach' ? 'море (ближайший пляж)' : group.label)
    if (group.status === 'unchecked') return `${label}: ${group.failure?.message ?? 'не удалось проверить.'}`
    if (group.status === 'none') return `${label}: в радиусе ${distanceText(radiusM)} нет.`
    const nearest = group.places[0]
    const routed = found.routes.find((r) => r.target.category === group.category)
    const way = routed && routed.route.kind !== 'straight' ? `; ${routeLine(routed)}` : ''
    return `${label}: ближайшее — ${quoted(nearest.name, nearest.category)}, ${distanceText(nearest.distanceM)} по прямой${way}.`
  })
  if (found.geocoded) {
    const target = found.routes.find((r) => !r.target.category)
    const name = found.geocoded.name ?? found.geocoded.displayName
    lines.push(target ? `${capital(routeLine(target))}.` : `${name}: ${found.geocoded.displayName}.`)
  }
  const notes = found.failures.filter((f) => !lines.some((line) => line.includes(f)))
  return [
    ...(ostrovok.length ? ['По данным Островка:', ...ostrovok] : []),
    ...(lines.length || !ostrovok.length ? ['По данным OpenStreetMap:', ...lines] : []),
    ...notes,
  ].join('\n')
}

function chatMap(hotel: GeoHotel, found: Found): ChatMap | undefined {
  const ostrovok: MapPoint[] = found.ostrovok.map(({ category, place }) => ({
    kind: 'place',
    label: place.name,
    category: CATEGORY[category].label,
    distanceM: Math.round(place.distanceM),
    lat: place.lat,
    lon: place.lon,
  }))
  const places: MapPoint[] = osmShown(found).flatMap((group) =>
    group.places.slice(0, SHOWN_PER_CATEGORY).map((p) => ({
      kind: 'place' as const,
      label: p.name ?? (group.category === 'sea' ? 'Берег моря' : capital(group.label)),
      category: group.label,
      distanceM: Math.round(p.distanceM),
      lat: p.lat,
      lon: p.lon,
    })),
  )
  places.unshift(...ostrovok)
  if (found.geocoded)
    places.unshift({
      kind: 'place',
      label: found.geocoded.name ?? found.geocoded.displayName,
      distanceM: Math.round(haversineMeters(hotel, found.geocoded)),
      lat: found.geocoded.lat,
      lon: found.geocoded.lon,
    })
  if (places.length === 0) return undefined
  const routes: MapRoute[] = found.routes.map(({ target, route }) => ({
    mode: route.kind,
    distanceM: route.distanceM,
    durationS: route.durationS,
    coordinates: thinLine(route.geometry.coordinates),
    to: target.label,
  }))
  return {
    points: [
      { kind: 'hotel', label: hotel.name, lat: hotel.lat, lon: hotel.lon },
      ...places.slice(0, MAX_MAP_POINTS - 1),
    ],
    routes,
    attribution: MAP_ATTRIBUTION_TEXT,
  }
}

/** The step's line of the places near: «аптека — 3, бар или паб — нет». */
function nearbyResult(nearby: Nearby): { status: TurnStep['status']; result: string } {
  const groups = shownGroups(nearby.groups)
  const unchecked = groups.filter((g) => g.status === 'unchecked')
  if (unchecked.length === groups.length)
    return { status: 'failed', result: unchecked[0].failure?.message ?? 'не удалось проверить' }
  const parts = groups.map((g) =>
    g.status === 'found'
      ? `${g.label} — ${Math.min(g.places.length, SHOWN_PER_CATEGORY)}`
      : g.status === 'none'
        ? `${g.label} — нет`
        : `${g.label} — не проверено`,
  )
  return { status: 'done', result: parts.join(', ') }
}

const nearbyTitle = (call: Extract<Call, { tool: 'nearbyPlaces' }>) => {
  const labels = shownGroups(
    call.categories.map((category) => ({ category, label: CATEGORY[category].label }) as NearbyGroup),
  ).map((g) => (g.category === 'beach' ? 'пляж' : g.label))
  return `Ищу рядом с отелем: ${labels.join(', ')} — в радиусе ${distanceText(call.radiusM)}`
}

/**
 * The geo steps of a hotel's question, or `null` when the hotel's point is not in the data loaded in advance: no
 * guesses about a city whose places are not there.
 */
export async function geoTurn(
  hotel: GeoHotel,
  messages: AssistantRequest['messages'],
  { deadline, signal, models, deps = serverGeoDeps(), ostrovok = [], onError }: GeoTurnOptions,
): Promise<GeoOutcome | null> {
  const stepsUntil = deadline - ANSWER_RESERVE_MS
  const point = { lat: hotel.lat, lon: hotel.lon }
  const here = await deps.store.near(point, 1, PLACE_CATEGORIES, 1, { deadline: stepsUntil, signal })
  // Outside the OSM data loaded in advance only the Ostrovok places answer; a cache that cannot be read says nothing
  // of the point, so without the Ostrovok places the answer is the hotel's own data, as before.
  const osm = here.ok && here.value.covered.length > 0
  if (!osm && ostrovok.length === 0) return null

  const steps: TurnStep[] = []
  const found: Found = { ostrovok: [], groups: [], failures: [], routes: [] }
  const fail = (message: string) => {
    if (!found.failures.includes(message)) found.failures.push(message)
  }

  const session = newGeoSession()
  const tools = (until: number) => geoTools({ deadline: until, signal, session }, deps)
  const text = messages.at(-1)?.text ?? ''
  let calls = rulesPlan(text)
  if (models?.length) {
    const plan = await firstAnswer(
      models,
      (model, timeout) =>
        modelPlan(
          model,
          hotel,
          messages,
          planTools({ nearby: NEARBY_DESCRIPTION, geocode: GEOCODE_DESCRIPTION }),
          timeout,
        ),
      { deadline: Math.min(Date.now() + PLAN_MS, stepsUntil), signal, onError },
    )
    if (plan.ok) calls = plan.value
  }

  /** Runs one call as a step with its own time; `undefined` when no time was left or the call threw. */
  async function step<T>(
    title: string,
    run: (tools: ReturnType<typeof geoTools>) => Promise<T>,
    line: (value: T) => { status: TurnStep['status']; result: string },
  ): Promise<T | undefined> {
    const until = Math.min(Date.now() + STEP_MS, stepsUntil)
    if (until - Date.now() < MIN_STEP_MS) {
      steps.push({ agent: 'geo', title, status: 'failed', result: 'не хватило времени ответа' })
      return undefined
    }
    try {
      const value = await run(tools(until))
      steps.push({ agent: 'geo', title, ...line(value) })
      return value
    } catch (error) {
      if (signal.aborted) throw error
      console.warn(`assistant: a geo step failed (${error instanceof Error ? error.name : 'error'})`)
      steps.push({ agent: 'geo', title, status: 'failed', result: 'не удалось проверить' })
      return undefined
    }
  }

  const plan = tidyPlan(calls)
  if (ostrovok.length) {
    found.ostrovok = ostrovokHits(ostrovok, askedCategories(plan))
    const kinds = [...new Set(found.ostrovok.map((hit) => hit.category))]
    steps.push({
      agent: 'geo',
      title: 'Смотрю места рядом по данным Островка',
      status: 'done',
      result: kinds.length
        ? kinds.map((c) => `${categoryLabel(c)} — ${found.ostrovok.filter((h) => h.category === c).length}`).join(', ')
        : 'таких мест в данных нет',
    })
  }
  if (!here.ok) fail(here.message)

  const options = { toolCallId: 'geo', messages: [], abortSignal: signal, context: {} } as never
  for (const call of osm ? plan : []) {
    if (call.tool === 'nearbyPlaces') {
      const nearby = await step(
        nearbyTitle(call),
        (t) =>
          t.nearbyPlaces.execute!(
            { ...point, categories: call.categories, radiusM: call.radiusM, perCategory: SHOWN_PER_CATEGORY },
            options,
          ) as Promise<Nearby>,
        nearbyResult,
      )
      for (const group of nearby?.groups ?? []) {
        found.groups.push({ group, radiusM: call.radiusM })
        if (group.status === 'unchecked' && group.failure) fail(group.failure.message)
      }
    } else {
      const geocoded = await step(
        `Ищу на карте «${call.query}»`,
        (t) => t.geocode.execute!({ query: call.query }, options) as Promise<GeoResult<Geocoded>>,
        (result) =>
          result.ok
            ? { status: 'done', result: `нашёл: ${result.value.places[0].name ?? result.value.places[0].displayName}` }
            : { status: 'failed', result: result.message },
      )
      if (geocoded?.ok) found.geocoded ??= geocoded.value.places[0]
      else if (geocoded && geocoded.reason !== 'not-found') fail(geocoded.message)
    }
  }

  const fromOstrovok = [...new Set(found.ostrovok.map((hit) => hit.category))].map((category): Target => {
    const { place } = found.ostrovok.find((hit) => hit.category === category)!
    return { lat: place.lat, lon: place.lon, label: place.name, category }
  })
  const targets: Target[] = [
    ...(found.geocoded ? [{ ...found.geocoded, label: found.geocoded.name ?? found.geocoded.displayName }] : []),
    ...fromOstrovok,
    ...osmShown(found).flatMap((group): Target[] => {
      const nearest = group.places[0]
      if (group.status !== 'found' || !nearest) return []
      return [{ ...nearest.near, label: nearest.name ?? capital(group.label), category: group.category }]
    }),
  ].slice(0, MAX_ROUTES)
  for (const target of targets) {
    const walk = haversineMeters(point, target) <= WALK_MAX_M
    const route = await step(
      `Строю маршрут ${walk ? 'пешком' : 'на машине'} до «${target.label}»`,
      (t) =>
        (walk
          ? t.walkingRoute.execute!({ from: point, to: target }, options)
          : t.drivingRoute.execute!({ from: point, to: target }, options)) as Promise<WalkRoute | DriveRoute>,
      (r) =>
        r.kind === 'straight'
          ? { status: 'failed', result: `по прямой ${distanceText(r.distanceM)}: ${r.reason.replace(/\.$/, '')}` }
          : { status: 'done', result: `${distanceText(r.distanceM)}, около ${durationText(r.durationS)}` },
    )
    if (route) found.routes.push({ target, route })
  }

  return {
    steps,
    facts: facts(found),
    summary: summary(found),
    notes: found.failures,
    ...withMap(chatMap(hotel, found)),
  }
}

const withMap = (map: ChatMap | undefined) => (map ? { map } : {})
