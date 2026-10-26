import 'server-only'
import type { AssistantRequest, TurnStep } from '../assistant'
import { todayIso } from '../dates'
import { checkViewPoints, loadHotelView } from '../db/view'
import { CATEGORY } from '../geo/categories'
import { MAP_ATTRIBUTION_TEXT, MAX_MAP_POINTS, distanceText, type ChatMap, type MapPoint } from '../geo/chatMap'
import { haversineMeters, type LatLon } from '../geo/distance'
import type { Geocoded, Nearby } from '../geo/places'
import { questionCategories } from '../geo/questions'
import type { GeoResult } from '../geo/result'
import { geoTools, newGeoSession, serverGeoDeps, type GeoDeps } from '../geo/tools'
import type { HotelDetails } from '../hotelDetails'
import {
  asksSea,
  asksSunset,
  bearingDeg,
  bearingLabel,
  buildingLabel,
  localTime,
  nearestRay,
  observerLabel,
  observerOf,
  pointVerdict,
  rayVerdict,
  seaVerdict,
  SUN_CHECK_ALTITUDE_DEG,
  sunsetOf,
  targetVerdict,
  VERDICT_LABEL,
  verdictReason,
  type HotelView,
  type SightLine,
  type Verdict,
  type ViewTarget,
} from '../view'
import { firstAnswer, type ModelLink } from './chain'
import { modelPlan, ostrovokHits, tidyPlan, type GeoHotel, type GeoOutcome } from './geoTurn'

/**
 * Эвал's answer to «видно ли море / закат / больницу из окна» in a hotel's chat: the same check as the page's «Вид из
 * отеля» (src/lib/view.ts, `hotel_view_lines`) from the floor the question names (the top one by default). The sea and
 * the sunset come from the page's data; a kind of place («больница») is the nearest of the hotel's Ostrovok places or of
 * OSM (`nearbyPlaces`), a named one is a place of the page's landmarks or is looked up (`geocode`, the model choosing the
 * call when one answers). Each is told «вероятно видно», «возможны препятствия» or «недостаточно данных» with the
 * reason; never more. A hotel without a reliable height of its building gets «недостаточно данных».
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

// The words of a question about the view, not a place's name.
const VIEW_WORDS =
  /(?<!\p{L})(?:видн\p{L}*|виден|увиж\p{L}*|увидеть|ли|из|с|со|на|в|а|и|окн\p{L}*|номер\p{L}*|отел\p{L}*|балкон\p{L}*|вид|вида|видом|этаж\p{L}*|какой|какая|что|будет|можно|мне|нам|нас|вас|там|у|\d+\p{L}*|-?(?:й|го|ом))(?!\p{L})/giu

/** The name of the place the question asks about, without the words of the question; `null` when nothing is left. */
export function placeQuery(text: string): string | null {
  const rest = text
    .replace(VIEW_WORDS, ' ')
    .replace(/[?!.,«»"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return rest.replace(/\p{L}/gu, '').length < rest.length && rest.length >= 3 ? rest : null
}

interface Checked {
  label: string
  category: string
  point: LatLon
  distanceM: number
  verdict: Verdict
  reason: string | null
}

const capital = (text: string) => text.charAt(0).toLocaleUpperCase('ru') + text.slice(1)

/** «• «Hospital La Fe» (больница, 1,2 км, азимут 210° (юго-запад)): возможны препятствия — мешает здание …». */
const lineOf = (c: Checked, hotel: LatLon) =>
  `• «${c.label}» (${c.category}, ${distanceText(c.distanceM)}, азимут ${bearingLabel(bearingDeg(hotel, c.point))}): ${VERDICT_LABEL[c.verdict]}${c.reason ? ` — ${c.reason}` : ''}.`

const fromTarget = (target: ViewTarget, eyeM: number): Checked => {
  const verdict = targetVerdict(target, eyeM)
  return {
    label: target.name,
    category: target.category,
    point: target,
    distanceM: target.distanceM,
    verdict,
    reason: verdictReason(target.line, verdict),
  }
}

/** The sea of the page's data, in the answer's words. */
function seaLine(view: HotelView): { text: string; checked?: Checked } {
  if (!view.seaChecked) return { text: '• Море: берег OpenStreetMap у отеля не загружен — недостаточно данных.' }
  const { verdict, point } = seaVerdict(view)
  if (!point) return { text: '• Море: берега ближе 6 км по OpenStreetMap нет.' }
  const reason = verdictReason(point.line, verdict)
  return {
    text: `• Море (берег в ${distanceText(point.distanceM)}, азимут ${bearingLabel(point.bearing)}): ${VERDICT_LABEL[verdict]}${reason ? ` — ${reason}` : ''}.`,
    checked: { ...fromTarget(point, view.observer.eyeM), label: 'Берег моря', verdict, reason },
  }
}

/** The sunset of `date` from the window, in the answer's words. */
function sunsetLine(view: HotelView, hotel: LatLon, date: string): string {
  const sunset = sunsetOf(date, hotel.lat, hotel.lon)
  if (!sunset) return '• Закат: не удалось рассчитать.'
  const ray = nearestRay(view.rays, sunset.checkAzimuth)
  const verdict = rayVerdict(ray, SUN_CHECK_ALTITUDE_DEG)
  const reason = ray ? verdictReason(ray.line, verdict) : null
  const day = new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  return `• Закат ${day} в ${localTime(sunset.at)}, азимут ${bearingLabel(sunset.azimuth)}: ${VERDICT_LABEL[verdict]}${reason ? ` — ${reason}` : ''} (солнце на высоте ${SUN_CHECK_ALTITUDE_DEG}°, за ~10–15 минут до захода).`
}

const NOTE =
  'Это оценка по высотам зданий EUBUCCO (обычно — оценка модели) без деревьев и рельефа; на какую сторону выходят окна номера, неизвестно — считаю, будто окно смотрит на место. Подробнее — в разделе «Вид из отеля» на странице отеля.'

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
  const floor = floorOf(text)
  const observer = observerOf(details?.building, floor)
  const buildingTitle = 'Смотрю высоту здания отеля по EUBUCCO'
  if (!details || !observer) {
    steps.push({ agent: 'geo', title: buildingTitle, status: 'failed', result: 'нет надёжной высоты здания' })
    return {
      steps,
      planner: 'rules',
      summary:
        'Недостаточно данных: высоты здания отеля нет в EUBUCCO или она сомнительна (номера занимают больше этажей, чем у найденного здания), поэтому не могу проверить, что видно из окна.',
    }
  }
  steps.push({
    agent: 'geo',
    title: buildingTitle,
    status: 'done',
    result: `${buildingLabel(observer)}; ${observerLabel(observer)}`,
  })

  const view = await loadView(hotel, details.building, details.nearby, floor)
  steps.push({
    agent: 'geo',
    title: 'Проверяю линии взгляда над зданиями',
    status: view ? 'done' : 'failed',
    result: view
      ? `${view.rays.length} направлений, ${view.sea.length} точек берега, ${view.landmarks.length} ориентиров`
      : 'не удалось проверить',
  })
  if (!view) return { steps, planner: 'rules', summary: 'Не удалось проверить вид из окна — недостаточно данных.' }

  const point = { lat: hotel.lat, lon: hotel.lon }
  const eyeM = view.observer.eyeM
  const lines: string[] = []
  const checked: Checked[] = []
  const wantsSea = asksSea(text)
  const wantsSunset = asksSunset(text)
  if (wantsSea) {
    const sea = seaLine(view)
    lines.push(sea.text)
    if (sea.checked) checked.push(sea.checked)
  }
  if (wantsSunset) lines.push(sunsetLine(view, point, date))

  const lower = text.toLocaleLowerCase('ru')
  const named = view.landmarks.filter((t) => lower.includes(t.name.toLocaleLowerCase('ru')))
  for (const target of named) checked.push(fromTarget(target, eyeM))

  const kinds = questionCategories(text).filter((c) => c !== 'sea' && c !== 'beach')
  const query = named.length || kinds.length ? null : placeQuery(text)
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
        steps.push({
          agent: 'geo',
          title,
          status: result.ok ? 'done' : 'failed',
          result: result.ok ? `нашёл: ${place?.name ?? place?.displayName}` : result.message,
        })
      } catch (error) {
        if (signal.aborted) throw error
        steps.push({ agent: 'geo', title, status: 'failed', result: 'не удалось проверить' })
      }
    }
    if (found.length) {
      const sightLines = await checkPoints(
        hotel,
        eyeM,
        found.map((f) => f.point),
      )
      steps.push({
        agent: 'geo',
        title: `Проверяю, видно ли из окна: ${found.map((f) => `«${f.label}»`).join(', ')}`,
        status: sightLines ? 'done' : 'failed',
        result: sightLines ? `${sightLines.filter(Boolean).length} линий взгляда` : 'не удалось проверить',
      })
      found.forEach((f, i) => {
        const line: SightLine | null = sightLines?.[i] ?? null
        const verdict = line ? pointVerdict(line, eyeM) : 'unknown'
        checked.push({
          label: f.label,
          category: f.category,
          point: f.point,
          distanceM: Math.round(line?.distanceM ?? haversineMeters(point, f.point)),
          verdict,
          reason: line ? verdictReason(line, verdict) : 'линию взгляда проверить не удалось',
        })
      })
    } else if (kinds.length) lines.push(`• ${capital(kinds.map((k) => CATEGORY[k].label).join(', '))}: рядом не нашёл.`)
  }

  // «Какой вид из окна?» without a place: the sea, the sunset of the day and the landmarks seen.
  if (!wantsSea && !wantsSunset && !named.length && !kinds.length && !query) {
    const sea = seaLine(view)
    lines.push(sea.text, sunsetLine(view, point, date))
    if (sea.checked) checked.push(sea.checked)
    const seen = view.landmarks.filter((t) => targetVerdict(t, eyeM) === 'visible').slice(0, 3)
    for (const target of seen) checked.push(fromTarget(target, eyeM))
    if (!seen.length) lines.push('• Ориентиры до 3 км: ни один не виден наверняка.')
  }

  const placeLines = checked.filter((c) => c.label !== 'Берег моря').map((c) => lineOf(c, point))
  const summary = [
    `Из окна (${observerLabel(view.observer)}; ${buildingLabel(view.observer)}):`,
    ...lines,
    ...placeLines,
    NOTE,
  ].join('\n')

  const places: MapPoint[] = checked.map((c) => ({
    kind: 'place',
    label: c.label,
    category: `${c.category} · ${VERDICT_LABEL[c.verdict]}`,
    distanceM: c.distanceM,
    lat: c.point.lat,
    lon: c.point.lon,
  }))
  const map: ChatMap | undefined = places.length
    ? {
        points: [{ kind: 'hotel', label: hotel.name, ...point }, ...places.slice(0, MAX_MAP_POINTS - 1)],
        routes: [],
        attribution: MAP_ATTRIBUTION_TEXT,
      }
    : undefined
  return { steps, summary, planner, ...(map && { map }), ...(modelsDown && { modelsDown: true as const }) }
}
