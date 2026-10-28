import 'server-only'
import type { AssistantRequest, TurnStep } from '../assistant'
import { todayIso } from '../dates'
import { countRu } from '../format'
import { checkViewPoints, loadHotelView } from '../db/view'
import { CATEGORY } from '../geo/categories'
import { MAX_VIEW_PLACES, VIEW_FOCUSES, type ViewWidget } from '../chatWidget'
import { distanceText } from '../geo/chatMap'
import { haversineMeters, type LatLon } from '../geo/distance'
import type { Geocoded, Nearby } from '../geo/places'
import { questionCategories } from '../geo/questions'
import type { GeoResult } from '../geo/result'
import { geoTools, newGeoSession, serverGeoDeps, type GeoDeps } from '../geo/tools'
import type { HotelDetails } from '../hotelDetails'
import {
  asksSea,
  asksSunrise,
  asksSunset,
  bearingDeg,
  bearingLabel,
  blockersAt,
  clampFloor,
  eyeOf,
  lineVerdict,
  localTime,
  reachLabel,
  reachOf,
  seaReach,
  SUN_CHECK_ALTITUDE_DEG,
  sunReach,
  sunriseOf,
  sunsetOf,
  VERDICT_LABEL,
  VERDICT_TONE,
  verdictReason,
  verdictText,
  windowLabel,
  windowOf,
  type HotelView,
  type Reach,
  type SightLine,
  type ViewTarget,
  type ViewWindow,
} from '../view'
import { firstAnswer, type ModelLink } from './chain'
import { modelPlan, ostrovokHits, tidyPlan, type GeoHotel, type GeoOutcome } from './geoTurn'

/**
 * Эвал's answer to «видно ли море / закат / больницу из окна» in a hotel's chat: the same check as the page's «Вид из
 * отеля» (src/lib/view.ts, `hotel_view_eyes`) for every floor — from which floor each target is seen — and from the
 * floor the question names, if it does. The sea, the sunset and the sunrise come from the page's data; a kind of place («больница») is the nearest of the hotel's Ostrovok places or of
 * OSM (`nearbyPlaces`), a named one is a place of the page's landmarks or is looked up (`geocode`, the model choosing the
 * call when one answers). Each is told «видно со всех этажей», «видно с N-го этажа», «возможно, видно с N-го этажа»,
 * «не видно ни с одного этажа» or «нет данных» with the reason, in the words of the page (`verdictText`); never more.
 * A hotel with neither a building's height nor the floors its rooms take gets «нет точных данных».
 */

export interface ViewTurnOptions {
  deadline: number
  signal: AbortSignal
  details: HotelDetails | null
  /** The day of the sunset: the stay's check-in, else today. */
  date?: string
  models?: readonly ModelLink[]
  deps?: GeoDeps
  /** The page's data and the lines to other points; the database's by default. */
  loadView?: typeof loadHotelView
  checkPoints?: typeof checkViewPoints
  onError?: (id: string, error: unknown) => void
}

/** The places of a kind the answer checks. */
const PER_KIND = 2
/** A kind of place is searched this far: what is farther is hardly seen over a city. */
const KIND_RADIUS_M = 3000
/** The model chooses the calls in this time at most. */
const PLAN_MS = 4000
/** Left of the answer's time when the steps end. */
const RESERVE_MS = 1500

/** «с 5 этажа», «5-й этаж», «на пятом» — the floor the question names, digits only. */
export function floorOf(text: string): number | null {
  const match = /(\d{1,2})\s*(?:-?(?:й|го|ом|ый|ой|м))?\s*этаж/iu.exec(text)
  const floor = match ? Number(match[1]) : NaN
  return Number.isInteger(floor) && floor > 0 ? floor : null
}

// The words of a question about the view, not a place's name: the window and the floor first, then the single words.
const VIEW_PHRASES =
  /(?<!\p{L})(?:(?:из|с|со|на) (?:окн|номер|отел|балкон|террас|крыш)\p{L}*|(?:с|со|на) \d+\S* этаж\p{L}*|(?:вид|видом) на)(?!\p{L})/giu
const VIEW_WORDS =
  /(?<!\p{L})(?:видн\p{L}*|виден|увиж\p{L}*|увидеть|просматрива\p{L}*|ли|вид|какой|какая|что|будет|можно|мне|нам|а|там|отсюда)(?!\p{L})/giu

/** The name of the place the question asks about, without the words of the question; `null` when nothing is left. */
export function placeQuery(text: string): string | null {
  const rest = text
    .replace(VIEW_PHRASES, ' ')
    .replace(VIEW_WORDS, ' ')
    .replace(/[?!.,«»"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return /\p{L}{3}/u.test(rest) ? rest : null
}

interface Checked {
  label: string
  category: string
  point: LatLon
  distanceM: number
  line: SightLine | null
  /** The angle of the line (`RAY_ANGLES`): 0 but for the sun. */
  angle?: number
  reach: Reach
}

const capital = (text: string) => text.charAt(0).toLocaleUpperCase('ru') + text.slice(1)

/**
 * Why, after the reach, in the page's words: from the floor asked, its verdict with the reason; else the verdict of the
 * floor below the one it is seen from, the building that may be higher for «возможно, видно», and the reason of the top
 * floor when it is not seen.
 */
function why(c: Pick<Checked, 'line' | 'angle' | 'reach'>, window: ViewWindow, floor: number | null): string {
  if (floor) return `; с ${floor}-го этажа — ${verdictText(c.line, eyeOf(window, floor), c.angle)}`
  const { reach } = c
  if (reach.kind === 'all') return ''
  if (reach.kind === 'from') return ` (ниже — ${verdictText(c.line, eyeOf(window, reach.floor - 1), c.angle)})`
  const eyeM = eyeOf(window, reach.kind === 'maybe' ? reach.floor : window.floors)
  if (reach.kind === 'none') return ` — ${verdictText(c.line, eyeM, c.angle)}`
  const reason = verdictReason(c.line, eyeM, c.angle)
  return reason ? (reach.kind === 'maybe' ? ` (${reason})` : ` — ${reason}`) : ''
}

/** «• «Hospital La Fe» (больница, 1,2 км, азимут 210° (юго-запад)): видно с 5-го этажа (ниже — закрыто зданием …).» */
const lineOf = (c: Checked, hotel: LatLon, window: ViewWindow, floor: number | null) =>
  `• «${c.label}» (${c.category}, ${distanceText(c.distanceM)}, азимут ${bearingLabel(bearingDeg(hotel, c.point))}): ${reachLabel(c.reach)}${why(c, window, floor)}.`

const fromTarget = (target: ViewTarget, window: ViewWindow): Checked => ({
  label: target.name,
  category: target.category,
  point: target,
  distanceM: target.distanceM,
  line: target.line,
  reach: reachOf(target.line, window),
})

/** The sea of the page's data, in the answer's words. */
function seaLine(view: HotelView, floor: number | null): { text: string; checked?: Checked } {
  if (!view.seaChecked) return { text: '• Море: берег OpenStreetMap у отеля не загружен — нет данных.' }
  const { reach, point } = seaReach(view)
  if (!point) return { text: '• Море: берега ближе 6 км по OpenStreetMap нет.' }
  const checked = { ...fromTarget(point, view.window), label: 'Берег моря', reach }
  return {
    text: `• Море (берег в ${distanceText(point.distanceM)}, азимут ${bearingLabel(point.bearing)}): ${reachLabel(reach)}${why(checked, view.window, floor)}.`,
    checked,
  }
}

/** The sea's verdict as advice, first in the answer to «какой вид из окна?»; none for a floor asked or an unsure verdict. */
function seaLead(reach: Checked['reach'] | undefined, floor: number | null): string | undefined {
  if (!reach || floor) return undefined
  if (reach.kind === 'all') return 'Море видно из окон с любого этажа.'
  if (reach.kind === 'from')
    return `Море видно с ${reach.floor}-го этажа, так что при бронировании просите номер повыше.`
  if (reach.kind === 'none') return 'Море из окон отеля не видно ни с одного этажа.'
  return undefined
}

const dayOf = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

/** The sunset of `date` from the windows, in the answer's words. */
function sunsetLine(view: HotelView, hotel: LatLon, date: string, floor: number | null): string {
  const sunset = sunsetOf(date, hotel.lat, hotel.lon)
  if (!sunset) return '• Закат: не удалось рассчитать.'
  const { ray, reach } = sunReach(view, sunset.checkAzimuth)
  return `• Закат ${dayOf(date)} в ${localTime(sunset.at)}, азимут ${bearingLabel(sunset.azimuth)}: ${reachLabel(reach)}${why({ line: ray?.line ?? null, angle: 1, reach }, view.window, floor)} (солнце на высоте ${SUN_CHECK_ALTITUDE_DEG}°, за ~10–15 минут до захода).`
}

/** The sunrise of `date` from the windows, in the answer's words. */
function sunriseLine(view: HotelView, hotel: LatLon, date: string, floor: number | null): string {
  const sunrise = sunriseOf(date, hotel.lat, hotel.lon)
  if (!sunrise) return '• Восход: не удалось рассчитать.'
  const { ray, reach } = sunReach(view, sunrise.checkAzimuth)
  return `• Восход ${dayOf(date)} в ${localTime(sunrise.at)}, азимут ${bearingLabel(sunrise.azimuth)}: ${reachLabel(reach)}${why({ line: ray?.line ?? null, angle: 1, reach }, view.window, floor)} (солнце на высоте ${SUN_CHECK_ALTITUDE_DEG}°).`
}

/** The view steps of a hotel's question about the view from its windows. */
export async function viewTurn(
  hotel: GeoHotel & { id: string },
  messages: AssistantRequest['messages'],
  {
    deadline,
    signal,
    details,
    date = todayIso(),
    models,
    deps = serverGeoDeps(),
    loadView = loadHotelView,
    checkPoints = checkViewPoints,
    onError,
  }: ViewTurnOptions,
): Promise<GeoOutcome> {
  const text = messages.at(-1)?.text ?? ''
  const steps: TurnStep[] = []
  const window = windowOf(details?.building, details?.facts.roomFloors)
  const asked = floorOf(text)
  const floor = window && asked ? clampFloor(window, asked) : null
  const buildingTitle = 'Смотрю этажи отеля: здание EUBUCCO и номера Островка'
  if (!details || !window) {
    steps.push({ agent: 'geo', title: buildingTitle, status: 'failed', result: 'нет точных данных' })
    return {
      steps,
      planner: 'rules',
      summary: 'Нет точных данных о высоте здания отеля и его этажах — не могу проверить, что видно из окна.',
    }
  }
  steps.push({
    agent: 'geo',
    title: buildingTitle,
    status: 'done',
    result: `${windowLabel(window)}; проверяю этажи с 1-го по ${window.floors}-й`,
  })

  const view = await loadView(hotel, details.building, details.facts.roomFloors, details.nearby)
  steps.push({
    agent: 'geo',
    title: 'Проверяю линии взгляда над зданиями',
    status: view ? 'done' : 'failed',
    result: view
      ? `${view.rays.length} направлений, ${view.sea.length} точек берега, ${view.landmarks.length} ориентиров`
      : 'не удалось проверить',
  })
  if (!view) return { steps, planner: 'rules', summary: 'Не удалось проверить вид из окна — нет данных.' }

  const point = { lat: hotel.lat, lon: hotel.lon }
  const lines: string[] = []
  const checked: Checked[] = []
  // The places looked up for the question, not of the page's data.
  const lookedUp: Checked[] = []
  const wantsSea = asksSea(text)
  const wantsSunset = asksSunset(text)
  const wantsSunrise = asksSunrise(text)
  let lead: string | undefined
  if (wantsSea) {
    const sea = seaLine(view, floor)
    lead = seaLead(sea.checked?.reach, floor)
    lines.push(sea.text)
    if (sea.checked) checked.push(sea.checked)
  }
  if (wantsSunset) lines.push(sunsetLine(view, point, date, floor))
  if (wantsSunrise) lines.push(sunriseLine(view, point, date, floor))

  const lower = text.toLocaleLowerCase('ru')
  const named = view.landmarks.filter((t) => lower.includes(t.name.toLocaleLowerCase('ru')))
  for (const target of named) {
    const c = fromTarget(target, view.window)
    checked.push(c)
    lookedUp.push(c)
  }

  const kinds = questionCategories(text).filter((c) => c !== 'sea' && c !== 'beach')
  const query = named.length || kinds.length || wantsSea || wantsSunset || wantsSunrise ? null : placeQuery(text)
  let planner: GeoOutcome['planner'] = 'rules'
  let modelsDown = false
  const found: { label: string; category: string; point: LatLon }[] = []

  if (kinds.length || query) {
    const stepsUntil = deadline - RESERVE_MS
    const session = newGeoSession()
    const options = { toolCallId: 'view', messages: [], abortSignal: signal, context: {} } as never
    const tools = () => geoTools({ deadline: stepsUntil, signal, session }, deps)
    // A kind: the hotel's Ostrovok places first, OSM for the kinds they lack.
    const hits = ostrovokHits(details.nearby, kinds)
    for (const kind of kinds) {
      const own = hits.filter((h) => h.category === kind).slice(0, PER_KIND)
      for (const { place } of own) found.push({ label: place.name, category: CATEGORY[kind].label, point: place })
    }
    const missing = kinds.filter((k) => !hits.some((h) => h.category === k))
    if (missing.length) {
      const title = `Ищу рядом с отелем: ${missing.map((k) => CATEGORY[k].label).join(', ')}`
      try {
        const nearby = (await tools().nearbyPlaces.execute!(
          { ...point, categories: missing, radiusM: KIND_RADIUS_M, perCategory: PER_KIND },
          options,
        )) as Nearby
        for (const group of nearby.groups)
          for (const place of group.places.slice(0, PER_KIND))
            found.push({
              label: place.name ?? capital(group.label),
              category: group.label,
              point: { lat: place.lat, lon: place.lon },
            })
        steps.push({
          agent: 'geo',
          title,
          status: 'done',
          result: nearby.groups.map((g) => `${g.label} — ${g.places.length ? g.places.length : 'нет'}`).join(', '),
        })
      } catch (error) {
        if (signal.aborted) throw error
        steps.push({ agent: 'geo', title, status: 'failed', result: 'не удалось проверить' })
      }
    }
    if (query) {
      // The model names the place when one answers; the words of the question otherwise.
      let name = query
      if (models?.length) {
        const plan = await firstAnswer(models, (model, timeout) => modelPlan(model, hotel, messages, timeout), {
          deadline: Math.min(Date.now() + PLAN_MS, stepsUntil),
          signal,
          onError,
        })
        const geocode = plan.ok ? tidyPlan(plan.value, text).find((call) => call.tool === 'geocode') : undefined
        if (geocode?.tool === 'geocode') {
          name = geocode.query
          planner = 'model'
        } else modelsDown = !plan.ok && plan.failed.length > 0
      }
      const title = `Ищу на карте «${name}»`
      try {
        const result = (await tools().geocode.execute!({ query: name }, options)) as GeoResult<Geocoded>
        const place = result.ok ? result.value.places[0] : undefined
        if (place) found.push({ label: place.name ?? place.displayName, category: 'место', point: place })
        else lines.push(`• «${name}»: ${result.ok ? 'не нашёл на карте' : result.message}`)
        steps.push({
          agent: 'geo',
          title,
          status: result.ok ? 'done' : 'failed',
          result: result.ok ? `нашёл: ${place?.name ?? place?.displayName}` : result.message,
        })
      } catch (error) {
        if (signal.aborted) throw error
        steps.push({ agent: 'geo', title, status: 'failed', result: 'не удалось проверить' })
        lines.push(`• «${name}»: не удалось найти на карте.`)
      }
    }
    if (found.length) {
      const sightLines = await checkPoints(
        hotel,
        found.map((f) => f.point),
      )
      steps.push({
        agent: 'geo',
        title: `Проверяю, видно ли из окна: ${found.map((f) => `«${f.label}»`).join(', ')}`,
        status: sightLines ? 'done' : 'failed',
        result: sightLines
          ? countRu(sightLines.filter(Boolean).length, ['линия взгляда', 'линии взгляда', 'линий взгляда'])
          : 'не удалось проверить',
      })
      const before = lookedUp.length
      found.forEach((f, i) => {
        const line: SightLine | null = sightLines?.[i] ?? null
        lookedUp.push({
          label: f.label,
          category: f.category,
          point: f.point,
          distanceM: Math.round(line?.distanceM ?? haversineMeters(point, f.point)),
          line,
          reach: reachOf(line, view.window),
        })
      })
      checked.push(...lookedUp.slice(before))
    } else if (kinds.length) lines.push(`• ${capital(kinds.map((k) => CATEGORY[k].label).join(', '))}: рядом не нашёл.`)
  }

  // «Какой вид из окна?» without a place: the sea, the sunset of the day and the landmarks seen.
  if (!wantsSea && !wantsSunset && !wantsSunrise && !named.length && !kinds.length && !query) {
    const sea = seaLine(view, floor)
    lead = seaLead(sea.checked?.reach, floor)
    lines.push(sea.text, sunsetLine(view, point, date, floor), sunriseLine(view, point, date, floor))
    if (sea.checked) checked.push(sea.checked)
    const seen = view.landmarks
      .map((t) => fromTarget(t, view.window))
      .filter((c) => c.reach.kind === 'all' || c.reach.kind === 'from')
      .sort((a, b) => (a.reach.kind === 'from' ? a.reach.floor : 1) - (b.reach.kind === 'from' ? b.reach.floor : 1))
      .slice(0, 3)
    checked.push(...seen)
    if (!seen.length) lines.push('• Ориентиры до 3 км: ни один не виден ни с одного этажа наверняка.')
  }

  const placeLines = checked.filter((c) => c.label !== 'Берег моря').map((c) => lineOf(c, point, view.window, floor))
  // The guests' own words about the view, as they wrote them: not checked against the lines.
  const quote = details.viewQuotes[0]
  const summary = [
    ...(lead ? [lead] : []),
    `Вот что видно из окон отеля (${windowLabel(view.window)}; проверены этажи с 1-го по ${view.window.floors}-й${floor ? `, отдельно — ${floor}-й` : ''}):`,
    ...lines,
    ...placeLines,
    ...(quote ? [`Гость о виде: «${quote.text}»`] : []),
  ].join('\n')

  // The widget's map: the lines of the page's data are read by the widget, the places looked up come with it.
  const eyeM = eyeOf(view.window, floor ?? view.window.floors)
  const widget: ViewWidget = {
    kind: 'view',
    hotel: { id: hotel.id, name: hotel.name, ...point },
    floor,
    date,
    focus: VIEW_FOCUSES.filter((f) => ({ sea: wantsSea, sunset: wantsSunset, sunrise: wantsSunrise })[f]),
    places: lookedUp.slice(0, MAX_VIEW_PLACES).map((c) => {
      const verdict = lineVerdict(c.line, eyeM)
      return {
        name: c.label,
        category: c.category,
        lat: c.point.lat,
        lon: c.point.lon,
        distanceM: c.distanceM,
        tone: VERDICT_TONE[verdict],
        verdict: VERDICT_LABEL[verdict],
        blockers: blockersAt(c.line, eyeM).map((b) => b.id),
      }
    }),
  }
  return { steps, summary, planner, widget, ...(modelsDown && { modelsDown: true as const }) }
}
