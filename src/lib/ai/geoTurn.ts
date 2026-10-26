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
} from '../geo/chatMap'
import { haversineMeters, type LatLon } from '../geo/distance'
import { MAX_WALK_M, type DriveRoute, type WalkRoute } from '../geo/osrm'
import { FAR_CATEGORIES, type Geocoded, type Nearby, type NearbyGroup, type Place } from '../geo/places'
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
 * Эвал's geo steps in a chat about a hotel. A model of the chain chooses the calls of the geo tools (the rules do
 * without one); each call runs as a step of its own, with its own time and its own line in the feed; then the routes
 * to the nearest places are built, on foot or, far, by car. The hotel's Ostrovok places (`ota_hotel_places`) come
 * first, OpenStreetMap adds what they do not have. The answer tells what was found by rules — no model can add a place
 * or a distance — with the honest words of the services that failed, and the map of the message shows it. Only for a
 * hotel with Ostrovok places or in the OSM data loaded in advance.
 */

export interface GeoHotel extends LatLon {
  name: string
}

export interface GeoOutcome {
  steps: TurnStep[]
  /** Эвал's answer: what the steps found, the places and the distances of the data only. */
  summary: string
  map?: ChatMap
  /** Who chose the calls. */
  planner: 'model' | 'rules'
  /** The models were asked and none chose the calls: the rules did. */
  modelsDown?: true
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
/** Left of the answer's time when the steps end: the answer and its way back. */
export const ANSWER_RESERVE_MS = 1500
/** A place found this near is the hotel itself: the model looked the hotel up. */
const SELF_M = 150
/** A step is not started with less than this left. */
const MIN_STEP_MS = 500
/** The calls of the model a turn runs. */
const MAX_CALLS = 3
/** The kinds of places a turn searches: the answer stays short. */
const MAX_CATEGORIES = 6
/** The routes a turn builds: to the nearest places of the first categories asked. */
const MAX_ROUTES = 2
/** Farther than this the route is by car. */
export const WALK_MAX_M = 3000
/** «Сколько идти» walks up to the farthest walk of OSRM; «сколько ехать» drives. */
const WALK_WORDS = /идти|пешком|пешк|дойти|прогул/i
const DRIVE_WORDS = /ехать|машин|такси|доехать|авто/i

/** On foot or by car: as the question says, else on foot up to `WALK_MAX_M`. */
export function walks(distanceM: number, text: string): boolean {
  if (DRIVE_WORDS.test(text)) return false
  if (WALK_WORDS.test(text)) return distanceM <= MAX_WALK_M
  return distanceM <= WALK_MAX_M
}
/** The places of a category the answer and the map show. */
const SHOWN_PER_CATEGORY = 3
/** «Рядом» is farther for the places a city has few of. */
const MIN_RADIUS_M: Partial<Record<PlaceCategory, number>> = {
  hospital: 3000,
  clinic: 2000,
  train_station: 3000,
  museum: 2000,
  park: 2000,
  attraction: 2000,
}

type NearbyCall = { tool: 'nearbyPlaces'; categories: PlaceCategory[]; radiusM: number }
type Call = NearbyCall | { tool: 'geocode'; query: string }

const nearbyInput = z.object({
  categories: z.array(z.enum(PLACE_CATEGORIES)).min(1).max(6),
  radiusM: z.number().int().min(100).max(FAR_RADIUS_M).describe('радиус поиска от отеля, метры'),
})
const geocodeInput = z.object({ query: z.string().trim().min(2).max(200).describe('название места или адрес') })

/**
 * The tools as the model sees them to choose the calls: the point is the hotel's, so the model never makes up
 * coordinates; no `execute`, the turn runs each call as a step of its own.
 */
const PLAN_TOOLS = {
  nearbyPlaces: tool({
    description: `${NEARBY_DESCRIPTION} Точка — отель, её указывать не нужно.`,
    inputSchema: nearbyInput,
  }),
  geocode: tool({
    description: `${GEOCODE_DESCRIPTION} Только для конкретного места по названию, не для видов мест.`,
    inputSchema: geocodeInput,
  }),
}

const planInstructions = (hotel: GeoHotel) =>
  [
    `Ты Эвал, помощник по отелю «${hotel.name}» в Валенсии. Выбери вызовы инструментов, чтобы ответить на последний`,
    'вопрос гостя о местах рядом с отелем или о пути до места. Виды мест (больница, аптека, бар, клуб, кафе, метро) —',
    'nearbyPlaces с радиусом 1000–3000; «что рядом» без вида — attraction, restaurant, supermarket, pharmacy, metro.',
    'Море — категории beach и sea, центр города — centre, аэропорт — airport, радиус 20000. Место с названием',
    `(рынок, музей, площадь, улица) — geocode с этим названием. Не больше ${MAX_CALLS} вызовов.`,
  ].join(' ')

/** The calls the model chose; throws when it chose none, so the next model of the chain is asked. */
async function modelPlan(
  model: LanguageModel,
  hotel: GeoHotel,
  messages: AssistantRequest['messages'],
  signal: AbortSignal,
): Promise<Call[]> {
  const { toolCalls } = await generateText({
    model,
    instructions: planInstructions(hotel),
    messages: messages.slice(-4).map(({ role, text }) => ({ role, content: text })),
    tools: PLAN_TOOLS,
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

/** The radius of a search: «рядом» of its categories, 20 km for a far one. */
const radiusOf = (categories: readonly PlaceCategory[], asked = NEAR_RADIUS_M) =>
  categories.some((c) => FAR_CATEGORIES.includes(c))
    ? FAR_RADIUS_M
    : Math.max(asked, NEAR_RADIUS_M, ...categories.map((c) => MIN_RADIUS_M[c] ?? 0))

/** The searches of `categories`: the near ones together, the far ones in 20 km. */
function searches(categories: readonly PlaceCategory[]): NearbyCall[] {
  const near = categories.filter((c) => !FAR_CATEGORIES.includes(c))
  const far = categories.filter((c) => FAR_CATEGORIES.includes(c))
  return [near, far].flatMap((group): NearbyCall[] =>
    group.length ? [{ tool: 'nearbyPlaces', categories: group, radiusM: radiusOf(group) }] : [],
  )
}

/** The calls by the words of the question; «что рядом» without a kind asks the everyday places. */
export function rulesPlan(text: string): Call[] {
  const named = questionCategories(text)
  return searches(named.length ? named : EVERYDAY)
}

/**
 * The model's calls made safe. A geocode of a kind of place («центр Валенсии», «аэропорт») is the search of the
 * kind; the kinds the words name and the model forgot are searched too; the sea is asked with its beaches (the
 * coastline has the port); the radius is at least the kind's «рядом», 20 km for a far one; a call repeated is
 * dropped; at most `MAX_CALLS`.
 */
export function tidyPlan(calls: readonly Call[], text: string): Call[] {
  const kept = calls.flatMap((call): Call[] => {
    if (call.tool === 'nearbyPlaces') return [call]
    const kinds = questionCategories(call.query)
    return kinds.length ? searches(kinds) : [call]
  })
  const asked = new Set(kept.flatMap((call) => (call.tool === 'nearbyPlaces' ? call.categories : [])))
  const forgotten = questionCategories(text).filter((c) => !asked.has(c))
  const all = [...kept, ...searches(forgotten)]
  const seen = new Set<string>()
  const taken = new Set<PlaceCategory>()
  return (all.length ? all : rulesPlan(text))
    .flatMap((call): Call[] => {
      if (call.tool !== 'nearbyPlaces') return [call]
      const wanted = call.categories.includes('sea') ? ['beach' as const, ...call.categories] : call.categories
      const kept: PlaceCategory[] = []
      for (const c of wanted) {
        // The sea goes with its beaches: it takes no room of its own.
        const counted = [...taken].filter((t) => t !== 'sea').length
        if (taken.has(c) || (c !== 'sea' && counted >= MAX_CATEGORIES)) continue
        taken.add(c)
        kept.push(c)
      }
      return kept.length ? [{ ...call, categories: kept, radiusM: radiusOf(kept, call.radiusM) }] : []
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

/** The Ostrovok places of `categories`, nearest first, `SHOWN_PER_CATEGORY` of each. */
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

const capital = (text: string) => text.charAt(0).toLocaleUpperCase('ru') + text.slice(1)
const kindLabel = (category: PlaceCategory) =>
  category === 'beach' ? 'море (ближайший пляж)' : CATEGORY[category].label
const placeName = (place: Place, group: NearbyGroup) =>
  place.name ?? (group.category === 'sea' ? 'Берег моря' : `${capital(group.label)} без названия`)

/**
 * The groups the answer shows: the sea is its nearest beach, the coastline only when no beach is near (`sea` may be
 * the port); each category once, the first call's; a place mapped twice (a node and a building) once.
 */
export function shownGroups(groups: readonly NearbyGroup[]): NearbyGroup[] {
  const unique = groups.filter((g, i) => groups.findIndex((h) => h.category === g.category) === i)
  const beach = unique.find((g) => g.category === 'beach')
  return unique
    .filter((g) => g.category !== 'sea' || beach?.status !== 'found')
    .map((g) => ({
      ...g,
      places: g.places.filter((p, i) => !p.name || g.places.findIndex((q) => q.name === p.name) === i),
    }))
}

interface Target extends LatLon {
  label: string
  /** The category it is the nearest of; none for a geocoded place. */
  category?: PlaceCategory
}

interface Routed {
  target: Target
  route: WalkRoute | DriveRoute
}

/** «пешком 1,3 км, около 18 мин», «маршрут не получен — по прямой 12 км». */
function wayText(route: WalkRoute | DriveRoute): string {
  if (route.kind === 'straight')
    return `маршрут не получен (${route.reason.replace(/\.$/, '')}) — по прямой ${distanceText(route.distanceM)}`
  const how = route.kind === 'foot' ? 'пешком' : 'на машине'
  return `${how} ${distanceText(route.distanceM)}, около ${durationText(route.durationS)}${route.kind === 'car' ? ' без пробок' : ''}`
}

/** The steps' state: what the calls found. */
interface Found {
  ostrovok: OstrovokHit[]
  groups: { group: NearbyGroup; radiusM: number }[]
  geocoded?: Geocoded['places'][number] & { distanceM: number }
  failures: string[]
  routes: Routed[]
}

/** The OSM groups the answer and the map show: the categories the Ostrovok places do not answer. */
const osmShown = (found: Found) =>
  shownGroups(found.groups.map((g) => g.group)).filter(
    (group) => !found.ostrovok.some((hit) => hit.category === (group.category === 'sea' ? 'beach' : group.category)),
  )

const radiusOfGroup = (found: Found, category: PlaceCategory) =>
  found.groups.find((g) => g.group.category === category)?.radiusM ?? NEAR_RADIUS_M

/** Эвал's answer from what was found: a line a kind, the nearest place, the way to it and the next ones. */
function summary(found: Found, hasMap: boolean): string {
  const way = (category?: PlaceCategory) => {
    const routed = found.routes.find((r) => r.target.category === category)
    return routed ? `; ${wayText(routed.route)}` : ''
  }
  const kinds = new Set([...found.ostrovok.map((hit) => hit.category), ...osmShown(found).map((g) => g.category)])
  // A long answer of many kinds names the nearest place of each only.
  const others = (names: string[]) => (names.length && kinds.size <= 2 ? ` Ещё: ${names.join(', ')}.` : '')
  const ostrovok = [...new Set(found.ostrovok.map((hit) => hit.category))].map((category) => {
    const [{ place }, ...rest] = found.ostrovok.filter((hit) => hit.category === category)
    const more = rest.map((hit) => `«${hit.place.name}» — ${distanceText(hit.place.distanceM)}`)
    // Ostrovok names an airport by its city: «Валенсия» (аэропорт).
    const kind = place.name.toLocaleLowerCase('ru').includes(place.kind.toLocaleLowerCase('ru'))
      ? ''
      : ` (${place.kind.toLocaleLowerCase('ru')})`
    return `• ${capital(kindLabel(category))}: ближе всего — «${place.name}»${kind}, ${distanceText(place.distanceM)} от отеля${way(category)}.${others(more)}`
  })
  const osm = osmShown(found).map((group) => {
    const label = capital(group.category === 'sea' ? 'берег моря' : kindLabel(group.category))
    if (group.status === 'unchecked') return `• ${label}: ${group.failure?.message ?? 'не удалось проверить.'}`
    if (group.status === 'none')
      return `• ${label}: в радиусе ${distanceText(radiusOfGroup(found, group.category))} нет.`
    const [nearest, ...rest] = group.places
    const more = rest.map((p) => `«${placeName(p, group)}» — ${distanceText(p.distanceM)}`)
    return `• ${label}: ближе всего — «${placeName(nearest, group)}», ${distanceText(nearest.distanceM)} от отеля по прямой${way(group.category)}.${others(more)}`
  })
  const place = found.geocoded
  const named = place
    ? [`• «${place.name ?? place.displayName}»: ${distanceText(place.distanceM)} от отеля по прямой${way(undefined)}.`]
    : []
  const sources = [found.ostrovok.length && 'Островка', (osm.length || named.length) && 'OpenStreetMap'].filter(Boolean)
  const lines = [...ostrovok, ...osm, ...named]
  const notes = found.failures.filter((f) => !lines.some((line) => line.includes(f)))
  if (lines.length === 0) return notes.join(' ') || 'Не нашёл таких мест в данных.'
  return [
    `По данным ${sources.join(' и ')}:`,
    ...lines,
    ...notes,
    ...(hasMap ? ['Места и маршруты — на карте ниже.'] : []),
  ].join('\n')
}

function chatMap(hotel: GeoHotel, found: Found): ChatMap | undefined {
  const places: MapPoint[] = [
    ...(found.geocoded
      ? [
          {
            kind: 'place' as const,
            label: found.geocoded.name ?? found.geocoded.displayName,
            distanceM: found.geocoded.distanceM,
            lat: found.geocoded.lat,
            lon: found.geocoded.lon,
          },
        ]
      : []),
    ...found.ostrovok.map(({ category, place }) => ({
      kind: 'place' as const,
      label: place.name,
      category: CATEGORY[category].label,
      distanceM: Math.round(place.distanceM),
      lat: place.lat,
      lon: place.lon,
      source: 'ostrovok' as const,
    })),
    ...osmShown(found).flatMap((group) =>
      group.places.map((p) => ({
        kind: 'place' as const,
        label: placeName(p, group),
        category: group.label,
        distanceM: Math.round(p.distanceM),
        lat: p.lat,
        lon: p.lon,
      })),
    ),
  ]
  if (places.length === 0) return undefined
  return {
    points: [
      { kind: 'hotel', label: hotel.name, lat: hotel.lat, lon: hotel.lon },
      ...places.slice(0, MAX_MAP_POINTS - 1),
    ],
    routes: found.routes.map(({ target, route }) => ({
      mode: route.kind,
      distanceM: route.distanceM,
      durationS: route.durationS,
      coordinates: thinLine(route.geometry.coordinates),
      to: target.label,
    })),
    attribution: MAP_ATTRIBUTION_TEXT,
  }
}

/** The step's line of the places near: «аптека — 3, бар или паб — нет». */
function nearbyResult(nearby: Nearby): Pick<TurnStep, 'status' | 'result'> {
  const groups = shownGroups(nearby.groups)
  const unchecked = groups.filter((g) => g.status === 'unchecked')
  if (unchecked.length === groups.length)
    return { status: 'failed', result: unchecked[0]?.failure?.message ?? 'не удалось проверить' }
  const parts = groups.map((g) =>
    g.status === 'found'
      ? `${g.label} — ${g.places.length}`
      : g.status === 'none'
        ? `${g.label} — нет`
        : `${g.label} — не проверено`,
  )
  return { status: 'done', result: parts.join(', ') }
}

const searchLabels = (categories: readonly PlaceCategory[]) =>
  categories
    .filter((c) => c !== 'sea' || !categories.includes('beach'))
    .map((c) => (c === 'beach' ? 'пляж' : CATEGORY[c].label))
    .join(', ')

/**
 * The geo steps of a hotel's question, or `null` when the hotel has neither Ostrovok places nor a point in the OSM
 * data loaded in advance: no guesses about a city whose places are not there.
 */
export async function geoTurn(
  hotel: GeoHotel,
  messages: AssistantRequest['messages'],
  { deadline, signal, models, deps = serverGeoDeps(), ostrovok = [], onError }: GeoTurnOptions,
): Promise<GeoOutcome | null> {
  const stepsUntil = deadline - ANSWER_RESERVE_MS
  const point = { lat: hotel.lat, lon: hotel.lon }
  const here = await deps.store.near(point, 1, PLACE_CATEGORIES, 1, { deadline: stepsUntil, signal })
  // A cache that cannot be read says nothing of the point: only the Ostrovok places answer then.
  const osm = here.ok && here.value.covered.length > 0
  if (!osm && ostrovok.length === 0) return null

  const steps: TurnStep[] = []
  const found: Found = { ostrovok: [], groups: [], failures: [], routes: [] }
  const fail = (message: string) => {
    if (!found.failures.includes(message)) found.failures.push(message)
  }
  if (!here.ok) fail(here.message)

  const text = messages.at(-1)?.text ?? ''
  let calls = rulesPlan(text)
  let planner: GeoOutcome['planner'] = 'rules'
  let modelsDown = false
  if (models?.length) {
    const plan = await firstAnswer(models, (model, timeout) => modelPlan(model, hotel, messages, timeout), {
      deadline: Math.min(Date.now() + PLAN_MS, stepsUntil),
      signal,
      onError,
    })
    if (plan.ok) {
      calls = plan.value
      planner = 'model'
    } else modelsDown = plan.failed.length > 0
  }
  const plan = tidyPlan(calls, text)

  if (ostrovok.length) {
    found.ostrovok = ostrovokHits(ostrovok, askedCategories(plan))
    const kinds = [...new Set(found.ostrovok.map((hit) => hit.category))]
    steps.push({
      agent: 'geo',
      title: 'Смотрю места рядом по данным Островка',
      status: 'done',
      result: kinds.length
        ? kinds.map((c) => `${CATEGORY[c].label} — ${found.ostrovok.filter((h) => h.category === c).length}`).join(', ')
        : 'таких мест в данных нет',
    })
  }

  const session = newGeoSession()
  const options = { toolCallId: 'geo', messages: [], abortSignal: signal, context: {} } as never
  /** Runs one call as a step with its own time; `undefined` when no time was left or the call threw. */
  async function step<T>(
    title: string,
    run: (tools: ReturnType<typeof geoTools>) => Promise<T>,
    line: (value: T) => Pick<TurnStep, 'status' | 'result'>,
  ): Promise<T | undefined> {
    const until = Math.min(Date.now() + STEP_MS, stepsUntil)
    if (until - Date.now() < MIN_STEP_MS) {
      steps.push({ agent: 'geo', title, status: 'failed', result: 'не хватило времени ответа' })
      return undefined
    }
    try {
      const value = await run(geoTools({ deadline: until, signal, session }, deps))
      steps.push({ agent: 'geo', title, ...line(value) })
      return value
    } catch (error) {
      if (signal.aborted) throw error
      console.warn(`assistant: a geo step failed (${error instanceof Error ? error.name : 'error'})`)
      steps.push({ agent: 'geo', title, status: 'failed', result: 'не удалось проверить' })
      return undefined
    }
  }

  for (const call of osm ? plan : []) {
    if (call.tool === 'nearbyPlaces') {
      const nearby = await step(
        `Ищу рядом с отелем: ${searchLabels(call.categories)} — в радиусе ${distanceText(call.radiusM)}`,
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
          !result.ok
            ? { status: 'failed', result: result.message }
            : haversineMeters(point, result.value.places[0]) <= SELF_M
              ? { status: 'done', result: 'это сам отель' }
              : {
                  status: 'done',
                  result: `нашёл: ${result.value.places[0].name ?? result.value.places[0].displayName}`,
                },
      )
      const place = geocoded?.ok ? geocoded.value.places[0] : undefined
      const distanceM = place ? Math.round(haversineMeters(point, place)) : 0
      if (place && distanceM > SELF_M) found.geocoded ??= { ...place, distanceM }
      else if (geocoded && !geocoded.ok) fail(geocoded.message)
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
      return [{ ...nearest.near, label: placeName(nearest, group), category: group.category }]
    }),
  ].slice(0, MAX_ROUTES)
  for (const target of targets) {
    const walk = walks(haversineMeters(point, target), text)
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

  const map = chatMap(hotel, found)
  return {
    steps,
    summary: summary(found, Boolean(map)),
    planner,
    ...(map && { map }),
    ...(modelsDown && { modelsDown: true as const }),
  }
}
