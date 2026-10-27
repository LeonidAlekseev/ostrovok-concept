import { countRu } from './format'
import type { HotelBuilding } from './hotelDetails'
import { distanceLabel } from './hotelDetails'

/**
 * «Вид из отеля» of a real hotel, the same for its page and for Эвал: from which floor of the hotel the sea, the
 * sunset, the sunrise, the attractions of OpenStreetMap and the places of Ostrovok can be seen, by the lines of sight
 * over the buildings of EUBUCCO (`hotel_view_eyes`, supabase/migrations/20261027150000_hotel_view_eyes.sql: the lowest
 * eye each line passes over all the buildings from). Which window a room has is not known, so every floor is checked:
 * a target is «видно со всех этажей», «видно с N-го этажа», «не видно ни с одного этажа» or «нет данных», and from a
 * floor «вероятно видно», «возможны препятствия» or «нет данных» — never a promise. The window is at the hotel's
 * point and looks every way: which side the windows of a room face is not known yet (`RoomWindowSide`), so the
 * traveller picks a side on the compass. No `server-only`: the page computes the sun and the floors.
 */

/** The verdicts from one floor, as the page and Эвал say them. */
export type Verdict = 'visible' | 'obstructed' | 'unknown'

export const VERDICT_LABEL: Record<Verdict, string> = {
  visible: 'вероятно видно',
  obstructed: 'возможны препятствия',
  unknown: 'нет данных',
}

/**
 * The Earth's radius with the standard refraction (k = 0.13), m: a point `d` metres away is `d² / (2 R')` lower than
 * the plane of the window. The same in `hotel_view_eyes`.
 */
export const EFFECTIVE_EARTH_RADIUS_M = 6_371_000 / (1 - 0.13)

/** The eyes are this high above the floor, m. */
export const EYE_ABOVE_FLOOR_M = 1.5

/**
 * A storey's height without exact data of the hotel's building, m: the median of height / floors of Valencia's
 * buildings in EUBUCCO whose height is measured (OSM) and floors are the cadastre's (294 buildings, 3.0 m).
 */
export const TYPICAL_STOREY_M = 3

/** The rays of the horizon: every `RAY_STEP_DEG` degrees, `RAY_LENGTH_M` long. */
export const RAY_STEP_DEG = 3
export const RAY_LENGTH_M = 1500

/** The sun is checked at this height above the horizon: ~10–15 minutes before the sunset, after the sunrise. */
export const SUN_CHECK_ALTITUDE_DEG = 2

/** The angles a ray of the horizon is measured at: the roofs (0°) and the sun (`SUN_CHECK_ALTITUDE_DEG`). */
export const RAY_ANGLES = [0, SUN_CHECK_ALTITUDE_DEG] as const
const ROOFS = 0
const SUN = 1

/** The attractions and the Ostrovok places checked are within this far; the sea within `SEA_RADIUS_M`. */
export const LANDMARK_RADIUS_M = 3000
export const SEA_RADIUS_M = 6000

/** The radius of the map's buildings of EUBUCCO, m: the street and the blocks around, ~250 KB. */
export const VIEW_MAP_RADIUS_M = 250

/** At most this many points of the coast are checked: the nearest of different bearings. */
export const MAX_SEA_POINTS = 8
/** Two points of the coast closer in bearing than this are one. */
const SEA_BEARING_GAP_DEG = 5

/** A building in the way of a line: in the way of an eye up to `eyeM` (EUBUCCO's height) or `eyeUpperM` (its upper bound). */
export interface LineBlocker {
  id: string
  /** From the hotel, m. */
  distanceM: number
  heightM: number
  estimated: boolean
  eyeM: number
  eyeUpperM: number
}

/** How high the eye must be for the line to pass over all its buildings, for one angle of a ray (one for a target). */
export interface LineEye {
  /** The lowest eye above the ground it passes from is above this, m, with EUBUCCO's heights; `null` without buildings. */
  eyeM: number | null
  /** The same with the upper bounds of EUBUCCO's height intervals. */
  eyeUpperM: number | null
  /** The buildings in the way of the highest eyes, the highest first. */
  blockers: LineBlocker[]
}

/** One line of sight as `hotel_view_eyes` measured it. */
export interface SightLine {
  /** From the hotel to the target, m. */
  distanceM: number
  /** Measured: no longer than 6 km, good coordinates. */
  checked: boolean
  /** The buildings the line crosses, but the hotel's and the target's. */
  crossed: number
  /** How far from the hotel the dataset covers the line, m. */
  coveredM: number | null
  /** By the angle of `RAY_ANGLES` for a ray of the horizon; one for a target. */
  eyes: LineEye[]
  /** The building at the target point: its top is what is seen. */
  targetBuilding: { id: string; heightM: number | null; estimated: boolean } | null
}

/**
 * The floors a window can be on. `building`: EUBUCCO's building at the hotel's point, its floors and a storey of its
 * height / floors. `rooms`: no exact data of the building (none at the point, or one lower than the floors the rooms
 * take): the floors the hotel's rooms take (Ostrovok's `floorsNumber`) with a storey of `TYPICAL_STOREY_M`.
 */
export interface ViewWindow {
  source: 'building' | 'rooms'
  /** The top floor: the floors are 1…`floors`. */
  floors: number
  storeyM: number
  /** The building's height, m; `null` for `rooms`. */
  heightM: number | null
  /** The eye's height is an estimate: EUBUCCO's model's height or the typical storey. */
  estimated: boolean
}

/** The floors of the window, `null` when there is neither a building's height nor the rooms' floors: «нет точных данных». */
export function windowOf(
  building: HotelBuilding | null | undefined,
  roomFloors: number | null | undefined,
): ViewWindow | null {
  const floors = building?.floors && building.floors > 0 ? Math.round(building.floors) : null
  const heightM = building?.heightM && building.heightM > 0 ? building.heightM : null
  if (floors && heightM)
    return {
      source: 'building',
      floors,
      storeyM: heightM / floors,
      heightM,
      estimated: Boolean(building?.heightEstimated),
    }
  // A building the rooms do not fit is dropped before (`isDoubtfulBuilding`): the rooms' floors are the most then.
  const rooms = roomFloors && roomFloors > 0 ? Math.round(roomFloors) : null
  return rooms ? { source: 'rooms', floors: rooms, storeyM: TYPICAL_STOREY_M, heightM: null, estimated: true } : null
}

/** The floor within the window's, 1 the ground one. */
export const clampFloor = (window: ViewWindow, floor: number) => Math.min(Math.max(Math.round(floor), 1), window.floors)

/** The eyes above the ground on the floor, m. */
export const eyeOf = (window: ViewWindow, floor: number) =>
  (clampFloor(window, floor) - 1) * window.storeyM + EYE_ABOVE_FLOOR_M

/** How far the Earth's curvature with the refraction lowers a point `d` metres away, m. */
export const curvatureDrop = (d: number) => (d * d) / (2 * EFFECTIVE_EARTH_RADIUS_M)

const deg = (rad: number) => (rad * 180) / Math.PI
const rad = (degrees: number) => (degrees * Math.PI) / 180

/**
 * The verdict of a line from an eye `eyeM` above the ground, for the angle `angle` of `RAY_ANGLES` (a target has one):
 * a building of the line in the way with EUBUCCO's height — «возможны препятствия»; else a line the dataset does not
 * cover to its end — «нет данных»; else a building in the way with the upper bound of its height — «возможны
 * препятствия»; else «вероятно видно».
 */
export function lineVerdict(line: SightLine | null | undefined, eyeM: number, angle = 0): Verdict {
  const eye = line?.eyes[angle]
  if (!line || !line.checked || line.coveredM === null || !eye) return 'unknown'
  if (eye.eyeM !== null && eyeM <= eye.eyeM) return 'obstructed'
  if (line.coveredM < line.distanceM - 1) return 'unknown'
  if (eye.eyeUpperM !== null && eyeM <= eye.eyeUpperM) return 'obstructed'
  return 'visible'
}

/** The buildings in the way of the eye: by EUBUCCO's height first, then by the upper bound, the highest first. */
export function blockersAt(line: SightLine | null | undefined, eyeM: number, angle = 0): LineBlocker[] {
  const blockers = line?.eyes[angle]?.blockers ?? []
  return [
    ...blockers.filter((b) => eyeM <= b.eyeM).sort((a, b) => b.eyeM - a.eyeM),
    ...blockers.filter((b) => eyeM > b.eyeM && eyeM <= b.eyeUpperM),
  ]
}

/** From which floor a target is seen. */
export type Reach = { kind: 'all' } | { kind: 'from'; floor: number } | { kind: 'none' } | { kind: 'unknown' }

/**
 * From which floor of the window the line is seen: the lowest floor of «вероятно видно» («со всех этажей» for the
 * first); none of them — «не видно ни с одного этажа» when every floor has a building in the way, else «нет данных».
 */
export function reachOf(line: SightLine | null | undefined, window: ViewWindow, angle = 0): Reach {
  const verdicts = Array.from({ length: window.floors }, (_, i) => lineVerdict(line, eyeOf(window, i + 1), angle))
  const seen = verdicts.indexOf('visible')
  if (seen === 0) return { kind: 'all' }
  if (seen > 0) return { kind: 'from', floor: seen + 1 }
  return verdicts.every((v) => v === 'obstructed') ? { kind: 'none' } : { kind: 'unknown' }
}

const reachRank = (reach: Reach) =>
  reach.kind === 'all' ? 1 : reach.kind === 'from' ? reach.floor : reach.kind === 'none' ? 1000 : 1001

/** The best of several: the lowest floor; a building in the way of every floor beats no data. */
export const bestReach = (reaches: readonly Reach[]): Reach =>
  reaches.reduce<Reach>((best, r) => (reachRank(r) < reachRank(best) ? r : best), { kind: 'unknown' })

/** «со 2-го», «с 5-го». */
export const fromFloor = (floor: number) => `${floor === 2 ? 'со' : 'с'} ${floor}-го`

export const reachLabel = (reach: Reach) =>
  reach.kind === 'all'
    ? 'видно со всех этажей'
    : reach.kind === 'from'
      ? `видно ${fromFloor(reach.floor)} этажа`
      : reach.kind === 'none'
        ? 'не видно ни с одного этажа'
        : 'нет данных'

/** The colour of a reach on the page: seen, in the way, not known. */
export const reachVerdict = (reach: Reach): Verdict =>
  reach.kind === 'all' || reach.kind === 'from' ? 'visible' : reach.kind === 'none' ? 'obstructed' : 'unknown'

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

/** The data of «Вид из отеля» for every floor, read by src/lib/db/view.ts. */
export interface HotelView {
  window: ViewWindow
  /** EUBUCCO's building the lines start in (the nearest within 50 m), not an obstacle; the map marks it. */
  ownBuilding: string | null
  /** Measured at `RAY_ANGLES`. */
  rays: ViewRay[]
  /** The points of the coast within `SEA_RADIUS_M`, nearest first; `seaChecked` false when OSM's coast is not loaded. */
  sea: ViewTarget[]
  seaChecked: boolean
  /** The attractions of OSM and the places of Ostrovok within `LANDMARK_RADIUS_M`, nearest first. */
  landmarks: ViewTarget[]
  /** Always empty for now: see `RoomWindowSide`. */
  windowSides: RoomWindowSide[]
}

/** From which floor a target is seen. */
export const targetReach = (target: ViewTarget, window: ViewWindow): Reach => reachOf(target.line, window)

/** The sea: the best of its points (of the side, if one is given) and the point of it, else the nearest point. */
export function seaReach(view: Pick<HotelView, 'sea' | 'seaChecked' | 'window'>, side?: SideId) {
  const points = view.sea.filter((p) => !side || inSide(p.bearing, side))
  const reaches = points.map((p) => targetReach(p, view.window))
  const reach: Reach = view.seaChecked && points.length ? bestReach(reaches) : { kind: 'unknown' }
  const index = reaches.findIndex((r) => reachRank(r) === reachRank(reach))
  return { reach, point: (points[index] ?? points[0]) as ViewTarget | undefined }
}

/** The ray towards the sun at `azimuth`, and from which floor the sun at `SUN_CHECK_ALTITUDE_DEG` is seen on it. */
export function sunReach(view: Pick<HotelView, 'rays' | 'window'>, azimuth: number) {
  const ray = nearestRay(view.rays, azimuth)
  return { ray, reach: ray ? reachOf(ray.line, view.window, SUN) : ({ kind: 'unknown' } as Reach) }
}

/** The buildings in the way of the sun from the eye. */
export const sunBlockers = (ray: ViewRay | undefined, eyeM: number) => blockersAt(ray?.line, eyeM, SUN)

/** What a side of the windows faces from the eye: the rays of its 45° over the roofs to their end. */
export function sideSummary(rays: readonly ViewRay[], side: SideId, eyeM: number) {
  const own = rays.filter((r) => inSide(r.bearing, side))
  return { rays: own.length, open: own.filter((r) => lineVerdict(r.line, eyeM, ROOFS) === 'visible').length }
}

/** The side the page opens on: the one with the most rays over the roofs, the first of `SIDES` on a tie. */
export const openestSide = (rays: readonly ViewRay[], eyeM: number): SideId =>
  SIDES.reduce((best, side) =>
    sideSummary(rays, side.id, eyeM).open > sideSummary(rays, best.id, eyeM).open ? side : best,
  ).id

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

export interface Sunrise {
  /** The sunrise: when and where. */
  at: Date
  azimuth: number
  /** The sun at `SUN_CHECK_ALTITUDE_DEG`: when and where it is checked. */
  checkAt: Date
  checkAzimuth: number
}

/**
 * The sunrise of the day `date` (`YYYY-MM-DD`) at the point: the first minute after the midnight (local, roughly) the
 * sun is above the horizon, and then above `SUN_CHECK_ALTITUDE_DEG`. `null` for a bad date or where it does not rise.
 */
export function sunriseOf(date: string, lat: number, lon: number): Sunrise | null {
  const start = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(start)) return null
  const midnight = start - (lon / 15) * 3_600_000
  let rise: { at: Date; azimuth: number } | null = null
  for (let minute = 0; minute < 12 * 60; minute++) {
    const at = new Date(midnight + minute * 60_000)
    const { altitude, azimuth } = sunPosition(at, lat, lon)
    if (!rise && altitude > SUNSET_ALTITUDE_DEG) rise = { at, azimuth }
    if (rise && altitude > SUN_CHECK_ALTITUDE_DEG)
      return { at: rise.at, azimuth: rise.azimuth, checkAt: at, checkAzimuth: azimuth }
  }
  return null
}

/** The bearings of the sunrise over the year: at the winter and the summer solstice. */
export function sunriseRange(year: number, lat: number, lon: number) {
  const winter = sunriseOf(`${year}-12-21`, lat, lon)
  const summer = sunriseOf(`${year}-06-21`, lat, lon)
  return winter && summer ? { winter: winter.azimuth, summer: summer.azimuth } : null
}

/** «293° (северо-запад)». */
export const bearingLabel = (bearing: number) => `${Math.round(bearing) % 360}° (${compassPoint(bearing)})`

/** «36», «34,5»: metres to a decimetre. */
const metres = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',')

/** «≈ 36 м (по оценке EUBUCCO)», «36 м». */
export const heightLabel = (heightM: number, estimated: boolean) =>
  estimated ? `≈ ${metres(heightM)} м (по оценке EUBUCCO)` : `${metres(heightM)} м`

/** «здание 12 этажей, ≈ 36 м (по оценке EUBUCCO)»; «нет точных данных о здании, номера на 6 этажах (Островок)». */
export const windowLabel = (window: ViewWindow) =>
  window.source === 'building'
    ? `здание ${countRu(window.floors, ['этаж', 'этажа', 'этажей'])}, ${heightLabel(window.heightM!, window.estimated)}`
    : `нет точных данных о здании, номера на ${countRu(window.floors, ['этаже', 'этажах', 'этажах'])} (Островок)`

/** «окно 12-го этажа, ≈ 33,5 м над землёй». */
export const floorLabel = (window: ViewWindow, floor: number) =>
  `окно ${clampFloor(window, floor)}-го этажа, ${window.estimated ? '≈ ' : ''}${metres(eyeOf(window, floor))} м над землёй`

/** Why a verdict from the eye: the building in the way, or the gap in the data. */
export function verdictReason(line: SightLine | null, verdict: Verdict, eyeM: number, angle = 0): string | null {
  if (!line) return 'линия не проверена'
  if (!line.checked) return 'дальше 6 км — не проверяем'
  const blocker = verdict === 'obstructed' ? blockersAt(line, eyeM, angle)[0] : undefined
  if (blocker)
    return `мешает здание ${heightLabel(blocker.heightM, blocker.estimated)} в ${distanceLabel(blocker.distanceM)} от отеля`
  if (verdict === 'unknown' && line.coveredM !== null && line.coveredM < line.distanceM - 1)
    return `данные о зданиях есть только на первые ${distanceLabel(line.coveredM)} пути`
  return null
}

/** The assumptions of the check, for the page's «Как мы считаем» and for Эвал. */
export const VIEW_ASSUMPTIONS = [
  'Окно — в точке отеля по координатам Островка; из какого окна смотрит номер, неизвестно, поэтому проверяем каждый этаж от 1-го до верхнего. Высота этажа = высота здания EUBUCCO / число его этажей, а без точных данных о здании — 3 м (медиана зданий Валенсии в EUBUCCO с измеренной высотой), этажей — сколько занимают номера по Островку; глаза на 1,5 м над полом. Стены самого здания и сторону окон номера не учитываем.',
  'Препятствия — здания EUBUCCO v0.2 (кадастр Испании, OSM, оценка модели); высоты почти везде — оценка модели EUBUCCO, «видно с этажа» — только если линия проходит выше и верхней границы её интервала. Деревья, рельеф, рекламные щиты и новые постройки не учтены; земля считается ровной.',
  'Кривизна Земли с рефракцией (k = 0,13) учтена: на 5 км точка ниже на ~1,7 м. Дальше 6 км линии не проверяем; если на пути есть участок без данных о зданиях (другой муниципалитет), ответ — «нет данных».',
  'Море видно, если ни одно здание до берега не закрывает горизонт моря; место — если не закрыта верхушка его здания (или земля в его точке). Закат и восход — солнце на высоте 2° над горизонтом по лучу 1,5 км.',
] as const

/** A question about the view from the window: «видно ли море», «вид из окна», «закат» — not the noise. */
export const isViewQuestion = (text: string) =>
  /(?<!\p{L})(?:видн|виден|видна|увиж|увидеть|просматрива|вид(?:ом)? (?:на|из)|из окн|из номера видно|закат|рассвет|восход солнц|панорам)/iu.test(
    text,
  )

/** A question about the sea: the sea, the beach, the coast. */
export const asksSea = (text: string) => /(?<!\p{L})(?:мор(?:е|я|ю|ем)(?!\p{L})|морск|пляж|побереж|залив)/iu.test(text)

/** A question about the sunset. */
export const asksSunset = (text: string) => /(?<!\p{L})(?:закат|заход солнц|солнце садит)/iu.test(text)

/** A question about the sunrise. */
export const asksSunrise = (text: string) => /(?<!\p{L})(?:рассвет|восход|солнце вста)/iu.test(text)

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
