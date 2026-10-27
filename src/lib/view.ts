import { countRu } from './format'
import type { HotelBuilding } from './hotelDetails'
import { distanceLabel } from './hotelDetails'

/**
 * «Вид из отеля» of a real hotel, the same for its page and for Эвал: what can be seen from a window of the hotel's
 * building — the sea, the sunset, the attractions of OpenStreetMap and the places of Ostrovok — by the lines of sight
 * over the buildings of EUBUCCO (`hotel_view_lines`, supabase/migrations/20261026150000_hotel_view.sql). A verdict is
 * one of three: «вероятно видно», «возможны препятствия», «недостаточно данных»; never a promise. The window is at the
 * hotel's point, on a floor of its building, and looks every way: which side the windows of a room face is not known
 * yet (`RoomWindowSide`), so the traveller picks a side on the compass. No `server-only`: the page computes the sun.
 */

/** The three verdicts, as the page and Эвал say them. */
export type Verdict = 'visible' | 'obstructed' | 'unknown'

export const VERDICT_LABEL: Record<Verdict, string> = {
  visible: 'вероятно видно',
  obstructed: 'возможны препятствия',
  unknown: 'недостаточно данных',
}

/**
 * The Earth's radius with the standard refraction (k = 0.13), m: a point `d` metres away is `d² / (2 R')` lower than
 * the plane of the window. The same in `hotel_view_lines`.
 */
export const EFFECTIVE_EARTH_RADIUS_M = 6_371_000 / (1 - 0.13)

/** The eyes are this high above the floor, m. */
export const EYE_ABOVE_FLOOR_M = 1.5

/** The rays of the horizon: every `RAY_STEP_DEG` degrees, `RAY_LENGTH_M` long. */
export const RAY_STEP_DEG = 3
export const RAY_LENGTH_M = 1500

/** The sun is checked at this height above the horizon: ~10–15 minutes before the sunset in Valencia. */
export const SUN_CHECK_ALTITUDE_DEG = 2

/** The attractions and the Ostrovok places checked are within this far; the sea within `SEA_RADIUS_M`. */
export const LANDMARK_RADIUS_M = 3000
export const SEA_RADIUS_M = 6000

/** At most this many points of the coast are checked: the nearest of different bearings. */
export const MAX_SEA_POINTS = 8
/** Two points of the coast closer in bearing than this are one. */
const SEA_BEARING_GAP_DEG = 5

/** One line of sight as `hotel_view_lines` measured it. */
export interface SightLine {
  /** From the hotel to the target, m. */
  distanceM: number
  /** Measured: no longer than 6 km, good coordinates. */
  checked: boolean
  /** The buildings the line crosses, but the hotel's and the target's. */
  crossed: number
  /** The highest angle above the window's horizontal of a building on the line, degrees, with EUBUCCO's heights. */
  maxAngle: number | null
  /** The same with the upper bounds of EUBUCCO's height intervals. */
  maxAngleUpper: number | null
  /** The nearest building whose top is above the window, m. */
  firstAboveM: number | null
  /** How far from the hotel the dataset covers the line, m. */
  coveredM: number | null
  /** The building of `maxAngle`. */
  blocker: { id: string; distanceM: number; heightM: number; estimated: boolean } | null
  /** The building at the target point: its top is what is seen. */
  targetBuilding: { id: string; heightM: number | null; estimated: boolean } | null
}

/** The window the lines are drawn from. */
export interface ViewObserver {
  /** The floor, 1 the ground one; `null` when EUBUCCO has no floors: the top of the building then. */
  floor: number | null
  /** The building's floors and height, from EUBUCCO. */
  floors: number | null
  heightM: number
  /** EUBUCCO's model estimated the height (`height_source` `estimated`): the page says «≈». */
  heightEstimated: boolean
  /** The eyes above the ground, m. */
  eyeM: number
}

/** The building of the hotel cannot carry a window: no height, or the point matched another building. */
export type NoObserver = 'no-building'

/** The window's height above the ground on `floor` (the top one by default); `null` without a height. */
export function observerOf(building: HotelBuilding | null | undefined, floor?: number | null): ViewObserver | null {
  const heightM = building?.heightM
  if (!building || !heightM || heightM <= 0) return null
  const floors = building.floors && building.floors > 0 ? Math.round(building.floors) : null
  const heightEstimated = Boolean(building.heightEstimated)
  if (!floors) return { floor: null, floors: null, heightM, heightEstimated, eyeM: Math.max(heightM - 1.5, 1.5) }
  const chosen = Math.min(Math.max(Math.round(floor ?? floors), 1), floors)
  const storey = heightM / floors
  return { floor: chosen, floors, heightM, heightEstimated, eyeM: (chosen - 1) * storey + EYE_ABOVE_FLOOR_M }
}

/** How far the Earth's curvature with the refraction lowers a point `d` metres away, m. */
export const curvatureDrop = (d: number) => (d * d) / (2 * EFFECTIVE_EARTH_RADIUS_M)

const deg = (rad: number) => (rad * 180) / Math.PI
const rad = (degrees: number) => (degrees * Math.PI) / 180

/** The angle above the window's horizontal of a point `heightM` above the ground `d` metres away, degrees. */
export const elevationAngle = (heightM: number, d: number, eyeM: number) =>
  deg(Math.atan2(heightM - eyeM - curvatureDrop(d), Math.max(d, 0.5)))

/** The angle of the sea's horizon below the window's horizontal, degrees (negative): the sea far away is seen there. */
export const seaHorizonAngle = (eyeM: number) => -deg(Math.sqrt((2 * eyeM) / EFFECTIVE_EARTH_RADIUS_M))

/**
 * The verdict of a line for a target seen at `targetAngle` degrees: a building of the line at or above it with
 * EUBUCCO's height — «возможны препятствия»; else a line the dataset does not cover to its end — «недостаточно данных»;
 * else a building at or above it with the upper bound of its height — «возможны препятствия»; else «вероятно видно».
 */
export function lineVerdict(line: SightLine | undefined, targetAngle: number): Verdict {
  if (!line || !line.checked || line.coveredM === null) return 'unknown'
  if (line.maxAngle !== null && line.maxAngle >= targetAngle) return 'obstructed'
  if (line.coveredM < line.distanceM - 1) return 'unknown'
  if (line.maxAngleUpper !== null && line.maxAngleUpper >= targetAngle) return 'obstructed'
  return 'visible'
}

/** The verdict of a place: its building's top, if it stands in one, else the ground at its point. */
export const pointVerdict = (line: SightLine | undefined, eyeM: number): Verdict =>
  line ? lineVerdict(line, elevationAngle(line.targetBuilding?.heightM ?? 0, line.distanceM, eyeM)) : 'unknown'

/** The verdict of the sea along a line to the coast: the water beyond it, up to the horizon, over the buildings. */
export const seaLineVerdict = (line: SightLine | undefined, eyeM: number): Verdict =>
  lineVerdict(line, seaHorizonAngle(eyeM))

/** The best of several lines: one seen is enough; one with buildings in the way beats one not known. */
export function bestVerdict(verdicts: readonly Verdict[]): Verdict {
  if (verdicts.includes('visible')) return 'visible'
  if (verdicts.includes('obstructed')) return 'obstructed'
  return 'unknown'
}

/** The bearing from `a` to `b`, degrees clockwise from north. */
export function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat))
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon))
  return (deg(Math.atan2(y, x)) + 360) % 360
}

/** The point `distanceM` metres from `from` at `bearing` degrees (a plane: within a few km of the hotel). */
export function pointAt(from: { lat: number; lon: number }, bearing: number, distanceM: number) {
  const north = Math.cos(rad(bearing)) * distanceM
  const east = Math.sin(rad(bearing)) * distanceM
  return { lat: from.lat + north / 110_574, lon: from.lon + east / (111_320 * Math.cos(rad(from.lat))) }
}

/** The bearings of the horizon's rays: 0, 3, …, 357. */
export const RAY_BEARINGS = Array.from({ length: 360 / RAY_STEP_DEG }, (_, i) => i * RAY_STEP_DEG)

/** The difference of two bearings, 0–180. */
export const bearingGap = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360)
  return Math.min(d, 360 - d)
}

/** The ray nearest to the bearing. */
export const nearestRay = <T extends { bearing: number }>(rays: readonly T[], bearing: number): T | undefined =>
  rays.reduce<T | undefined>(
    (best, ray) => (!best || bearingGap(ray.bearing, bearing) < bearingGap(best.bearing, bearing) ? ray : best),
    undefined,
  )

/** «северо-запад» */
const POINTS = ['север', 'северо-восток', 'восток', 'юго-восток', 'юг', 'юго-запад', 'запад', 'северо-запад']
export const compassPoint = (bearing: number) => POINTS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]

/** The sides of the compass the traveller picks, 45° each, centred on their bearing. */
export const SIDES = [
  { id: 'n', label: 'Север', short: 'С', bearing: 0 },
  { id: 'ne', label: 'Северо-восток', short: 'СВ', bearing: 45 },
  { id: 'e', label: 'Восток', short: 'В', bearing: 90 },
  { id: 'se', label: 'Юго-восток', short: 'ЮВ', bearing: 135 },
  { id: 's', label: 'Юг', short: 'Ю', bearing: 180 },
  { id: 'sw', label: 'Юго-запад', short: 'ЮЗ', bearing: 225 },
  { id: 'w', label: 'Запад', short: 'З', bearing: 270 },
  { id: 'nw', label: 'Северо-запад', short: 'СЗ', bearing: 315 },
] as const

export type SideId = (typeof SIDES)[number]['id']

export const SIDE_HALF_WIDTH_DEG = 22.5

export const sideOf = (id: SideId) => SIDES.find((s) => s.id === id)!

export const inSide = (bearing: number, side: SideId) =>
  bearingGap(bearing, sideOf(side).bearing) <= SIDE_HALF_WIDTH_DEG

/**
 * The side of the windows of a room type, for when the data comes (from the hotel or Ostrovok): nothing fills it yet,
 * and nothing guesses it — the page asks the traveller to pick a side.
 */
export interface RoomWindowSide {
  /** The Ostrovok room group (`rg_hash`). */
  rgHash: string
  roomName: string
  sides: SideId[]
  source: 'hotel' | 'ostrovok'
}

/** A ray of the horizon. */
export interface ViewRay {
  bearing: number
  line: SightLine
}

/** What is checked, by its source. */
export type TargetKind = 'sea' | 'attraction' | 'ostrovok' | 'place'

/** A place checked for the view. */
export interface ViewTarget {
  kind: TargetKind
  name: string
  /** «Музей», «достопримечательность», … */
  category: string
  lat: number
  lon: number
  distanceM: number
  bearing: number
  line: SightLine | null
}

/** The data of «Вид из отеля» for one floor, read by src/lib/db/view.ts. */
export interface HotelView {
  observer: ViewObserver
  /** The floors to pick from, the top last; empty without EUBUCCO's floors. */
  floors: number[]
  rays: ViewRay[]
  /** The points of the coast within `SEA_RADIUS_M`, nearest first; `seaChecked` false when OSM's coast is not loaded. */
  sea: ViewTarget[]
  seaChecked: boolean
  /** The attractions of OSM and the places of Ostrovok within `LANDMARK_RADIUS_M`, nearest first. */
  landmarks: ViewTarget[]
  /** Always empty for now: see `RoomWindowSide`. */
  windowSides: RoomWindowSide[]
}

/** The verdict of a target from the window. */
export const targetVerdict = (target: ViewTarget, eyeM: number): Verdict =>
  !target.line ? 'unknown' : target.kind === 'sea' ? seaLineVerdict(target.line, eyeM) : pointVerdict(target.line, eyeM)

/** The sea from the window: the best of its points, with the nearest one seen, else the nearest one. */
export function seaVerdict(view: Pick<HotelView, 'sea' | 'seaChecked' | 'observer'>, side?: SideId) {
  const points = view.sea.filter((p) => !side || inSide(p.bearing, side))
  const verdicts = points.map((p) => targetVerdict(p, view.observer.eyeM))
  const verdict = view.seaChecked && points.length ? bestVerdict(verdicts) : 'unknown'
  const shown = points.find((_, i) => verdicts[i] === verdict) ?? points[0]
  return { verdict, point: shown as ViewTarget | undefined }
}

/** The verdict of the horizon on a ray for something `targetAngle` degrees high, at the ray's end. */
export const rayVerdict = (ray: ViewRay | undefined, targetAngle: number): Verdict =>
  ray ? lineVerdict(ray.line, targetAngle) : 'unknown'

/**
 * What a side of the windows faces: the rays of its 45° whose buildings all stay below the window to the ray's end
 * (the view over the roofs), and the nearest building above the window.
 */
export function sideSummary(rays: readonly ViewRay[], side: SideId) {
  const own = rays.filter((r) => inSide(r.bearing, side))
  const open = own.filter((r) => rayVerdict(r, 0) === 'visible').length
  const above = own.map((r) => r.line.firstAboveM).filter((m): m is number => m !== null)
  return { rays: own.length, open, nearestAboveM: above.length ? Math.min(...above) : null }
}

/** The side the page opens on: the one with the most rays over the roofs, the first of `SIDES` on a tie. */
export const openestSide = (rays: readonly ViewRay[]): SideId =>
  SIDES.reduce((best, side) => (sideSummary(rays, side.id).open > sideSummary(rays, best.id).open ? side : best)).id

// The sun, by the NOAA approximation of the solar position (~0.01°, enough for a window).

/** The sun's height above the horizon and its bearing at `time` seen from the point, degrees. */
export function sunPosition(time: Date, lat: number, lon: number): { altitude: number; azimuth: number } {
  const n = time.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545
  const meanLongitude = (280.46 + 0.9856474 * n) % 360
  const anomaly = rad((357.528 + 0.9856003 * n) % 360)
  const longitude = rad(meanLongitude + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly))
  const obliquity = rad(23.439 - 0.0000004 * n)
  const ra = Math.atan2(Math.cos(obliquity) * Math.sin(longitude), Math.cos(longitude))
  const dec = Math.asin(Math.sin(obliquity) * Math.sin(longitude))
  const sidereal = rad((((280.46061837 + 360.98564736629 * n + lon) % 360) + 360) % 360)
  const hour = sidereal - ra
  const phi = rad(lat)
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hour))
  const azimuth = Math.atan2(Math.sin(hour), Math.cos(hour) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi))
  return { altitude: deg(altitude), azimuth: (deg(azimuth) + 180 + 360) % 360 }
}

/** The sun's upper edge touches the horizon with the refraction: the sunset of the almanacs. */
const SUNSET_ALTITUDE_DEG = -0.833

export interface Sunset {
  /** The sun at `SUN_CHECK_ALTITUDE_DEG`: when and where it is checked. */
  checkAt: Date
  checkAzimuth: number
  /** The sunset: when and where. */
  at: Date
  azimuth: number
}

/**
 * The sunset of the day `date` (`YYYY-MM-DD`) at the point: the first minute after the noon (UTC) the sun goes below
 * `SUN_CHECK_ALTITUDE_DEG` and then below the horizon. `null` for a bad date or where the sun does not set.
 */
export function sunsetOf(date: string, lat: number, lon: number): Sunset | null {
  const start = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(start)) return null
  // The local noon in UTC, roughly: the sun is up from there on, the sunset comes before the next noon.
  const noon = start + (12 - lon / 15) * 3_600_000
  let check: { at: Date; azimuth: number } | null = null
  for (let minute = 0; minute < 12 * 60; minute++) {
    const at = new Date(noon + minute * 60_000)
    const { altitude, azimuth } = sunPosition(at, lat, lon)
    if (!check && altitude < SUN_CHECK_ALTITUDE_DEG) check = { at, azimuth }
    if (altitude < SUNSET_ALTITUDE_DEG)
      return check ? { checkAt: check.at, checkAzimuth: check.azimuth, at, azimuth } : null
  }
  return null
}

/** The bearings of the sunset over the year: at the winter and the summer solstice. */
export function sunsetRange(year: number, lat: number, lon: number) {
  const winter = sunsetOf(`${year}-12-21`, lat, lon)
  const summer = sunsetOf(`${year}-06-21`, lat, lon)
  return winter && summer ? { winter: winter.azimuth, summer: summer.azimuth } : null
}

/** The hotel's time zone: the sunsets are told in it. */
export const VALENCIA_TIME_ZONE = 'Europe/Madrid'

/** «21:20» in Valencia. */
export const localTime = (time: Date) =>
  time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: VALENCIA_TIME_ZONE })

/** «293° (северо-запад)». */
export const bearingLabel = (bearing: number) => `${Math.round(bearing) % 360}° (${compassPoint(bearing)})`

/** «36», «34,5»: metres to a decimetre. */
const metres = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',')

/** «≈ 36 м (по оценке EUBUCCO)», «36 м». */
export const heightLabel = (heightM: number, estimated: boolean) =>
  estimated ? `≈ ${metres(heightM)} м (по оценке EUBUCCO)` : `${metres(heightM)} м`

/** «окно 12-го этажа, ≈ 33,5 м над землёй», «окно у крыши, ≈ 20 м над землёй». */
export function observerLabel(observer: ViewObserver): string {
  const eye = `${observer.heightEstimated ? '≈ ' : ''}${metres(observer.eyeM)} м над землёй`
  return observer.floor ? `окно ${observer.floor}-го этажа, ${eye}` : `окно у крыши, ${eye}`
}

/** «здание 12 этажей, ≈ 36 м (по оценке EUBUCCO)». */
export const buildingLabel = (observer: ViewObserver) =>
  `здание${observer.floors ? ` ${countRu(observer.floors, ['этаж', 'этажа', 'этажей'])},` : ''} ${heightLabel(observer.heightM, observer.heightEstimated)}`

/** Why a verdict: the building in the way, or the gap in the data. */
export function verdictReason(line: SightLine | null, verdict: Verdict): string | null {
  if (!line) return 'линия не проверена'
  if (!line.checked) return 'дальше 6 км — не проверяем'
  if (verdict === 'obstructed' && line.blocker)
    return `мешает здание ${heightLabel(line.blocker.heightM, line.blocker.estimated)} в ${distanceLabel(line.blocker.distanceM)} от отеля`
  if (verdict === 'unknown' && line.coveredM !== null && line.coveredM < line.distanceM - 1)
    return `данные о зданиях есть только на первые ${distanceLabel(line.coveredM)} пути`
  return null
}

/** The assumptions of the check, for the page's «Как мы считаем» and for Эвал. */
export const VIEW_ASSUMPTIONS = [
  'Окно — в точке отеля по координатам Островка, на выбранном этаже (высота этажа = высота здания / число этажей, глаза на 1,5 м над полом); стены самого здания и сторону окон номера не учитываем.',
  'Препятствия — здания EUBUCCO v0.2 (кадастр Испании, OSM, оценка модели); высоты почти везде — оценка модели EUBUCCO, проверяем и с верхней границей её интервала. Деревья, рельеф, рекламные щиты и новые постройки не учтены; земля считается ровной.',
  'Кривизна Земли с рефракцией (k = 0,13) учтена: на 5 км точка ниже на ~1,7 м. Дальше 6 км линии не проверяем; если на пути есть участок без данных о зданиях (другой муниципалитет), ответ — «недостаточно данных».',
  'Море видно, если ни одно здание до берега не закрывает горизонт моря; место — если не закрыта верхушка его здания (или земля в его точке). Закат — солнце на высоте 2° (за ~10–15 минут до захода) по лучу 1,5 км.',
] as const

/** A question about the view from the window: «видно ли море», «вид из окна», «закат» — not the noise. */
export const isViewQuestion = (text: string) =>
  /(?<!\p{L})(?:видн|виден|видна|увиж|увидеть|просматрива|вид(?:ом)? (?:на|из)|из окн|из номера видно|закат|панорам)/iu.test(
    text,
  )

/** A question about the sea: the sea, the beach, the coast. */
export const asksSea = (text: string) => /(?<!\p{L})(?:мор(?:е|я|ю|ем)(?!\p{L})|морск|пляж|побереж|залив)/iu.test(text)

/** A question about the sunset. */
export const asksSunset = (text: string) => /(?<!\p{L})(?:закат|заход солнц|солнце садит)/iu.test(text)

/**
 * The points of the coast to check, from the nearest points of OSM's coastline ways: within `SEA_RADIUS_M`, nearest
 * first, one per `SEA_BEARING_GAP_DEG` of bearing, at most `MAX_SEA_POINTS`.
 */
export function seaPoints<T extends { lat: number; lon: number; distanceM: number }>(
  hotel: { lat: number; lon: number },
  points: readonly T[],
): (T & { bearing: number })[] {
  const kept: (T & { bearing: number })[] = []
  for (const point of [...points].sort((a, b) => a.distanceM - b.distanceM)) {
    if (point.distanceM > SEA_RADIUS_M || kept.length >= MAX_SEA_POINTS) break
    const bearing = bearingDeg(hotel, point)
    if (kept.some((k) => bearingGap(k.bearing, bearing) < SEA_BEARING_GAP_DEG)) continue
    kept.push({ ...point, bearing })
  }
  return kept
}
