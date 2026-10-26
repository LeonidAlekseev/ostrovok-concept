import { formatDecimal } from '../format'
import type { LatLon } from './distance'

/**
 * The map of Эвал's message: the hotel, the places the geo tools found and the routes to them. It is kept in the chat
 * (the guest's storage, Supabase, a shared snapshot), so it is small — a route keeps at most `MAX_ROUTE_POINTS`
 * points of 5 decimals (about a metre) — and checked when read. No `server-only`: the feed draws it.
 */

export const MAP_ATTRIBUTION_TEXT = '© OpenStreetMap'

export interface MapPoint extends LatLon {
  kind: 'hotel' | 'place'
  /** The name, or the category when the place has none. */
  label: string
  /** The category in Russian: «аптека». */
  category?: string
  /** From the hotel, metres, by the straight line to the place's shape. */
  distanceM?: number
  /** A place of the hotel's Ostrovok page; the rest are OpenStreetMap's. */
  source?: 'ostrovok'
}

export type MapRouteMode = 'foot' | 'car' | 'straight'

export interface MapRoute {
  mode: MapRouteMode
  distanceM: number
  durationS: number
  /** GeoJSON `[lon, lat]`. */
  coordinates: [number, number][]
  /** The label of the point the route goes to. */
  to: string
}

export interface ChatMap {
  points: MapPoint[]
  routes: MapRoute[]
  attribution: string
}

export const MAX_ROUTE_POINTS = 200
export const MAX_MAP_POINTS = 12
const MAX_ROUTES = 4
const MAX_LABEL = 120

/** «750 м», «1,2 км». */
export const distanceText = (m: number) =>
  m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} м` : `${formatDecimal(m / 1000)} км`

/** «9 мин», «1 ч 5 мин». */
export function durationText(s: number): string {
  const minutes = Math.max(1, Math.round(s / 60))
  if (minutes < 60) return `${minutes} мин`
  const rest = minutes % 60
  return `${Math.floor(minutes / 60)} ч${rest ? ` ${rest} мин` : ''}`
}

const round = (value: number) => Math.round(value * 1e5) / 1e5

/** At most `max` points of the line, the first and the last kept, rounded to 5 decimals. */
export function thinLine(coordinates: readonly [number, number][], max = MAX_ROUTE_POINTS): [number, number][] {
  const step = Math.max(1, Math.ceil((coordinates.length - 1) / Math.max(1, max - 1)))
  const kept = coordinates.filter((_, i) => i % step === 0 || i === coordinates.length - 1)
  return kept.map(([lon, lat]) => [round(lon), round(lat)])
}

type Shape = Record<string, unknown>
const isObject = (value: unknown): value is Shape =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isMetres = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const isLat = (value: unknown): value is number => typeof value === 'number' && Math.abs(value) <= 90
const isLon = (value: unknown): value is number => typeof value === 'number' && Math.abs(value) <= 180
const label = (value: unknown) => (typeof value === 'string' && value.trim() ? value.slice(0, MAX_LABEL) : undefined)

function parsePoint(value: unknown): MapPoint[] {
  if (!isObject(value) || !isLat(value.lat) || !isLon(value.lon)) return []
  const name = label(value.label)
  if (!name || (value.kind !== 'hotel' && value.kind !== 'place')) return []
  const category = label(value.category)
  return [
    {
      kind: value.kind,
      label: name,
      lat: value.lat,
      lon: value.lon,
      ...(category && { category }),
      ...(isMetres(value.distanceM) && { distanceM: value.distanceM }),
      ...(value.source === 'ostrovok' && { source: 'ostrovok' as const }),
    },
  ]
}

function parseRoute(value: unknown): MapRoute[] {
  if (!isObject(value) || !['foot', 'car', 'straight'].includes(value.mode as string)) return []
  if (!isMetres(value.distanceM) || !isMetres(value.durationS) || !Array.isArray(value.coordinates)) return []
  const coordinates = value.coordinates.filter(
    (pair): pair is [number, number] => Array.isArray(pair) && isLon(pair[0]) && isLat(pair[1]),
  )
  const to = label(value.to)
  if (coordinates.length < 2 || !to) return []
  return [
    {
      mode: value.mode as MapRouteMode,
      distanceM: value.distanceM,
      durationS: value.durationS,
      coordinates: thinLine(coordinates.map(([lon, lat]) => [lon, lat])),
      to,
    },
  ]
}

/** The known parts of a stored map; `undefined` without a hotel and a place to show. */
export function parseChatMap(value: unknown): ChatMap | undefined {
  if (!isObject(value) || !Array.isArray(value.points)) return undefined
  const points = value.points.slice(0, MAX_MAP_POINTS).flatMap(parsePoint)
  if (!points.some((p) => p.kind === 'place')) return undefined
  const routes = Array.isArray(value.routes) ? value.routes.slice(0, MAX_ROUTES).flatMap(parseRoute) : []
  return { points, routes, attribution: MAP_ATTRIBUTION_TEXT }
}

/** The number of each point in the list under the map: the places from 1, the hotel none. */
export const placeNumbers = (data: ChatMap) => {
  let n = 0
  return data.points.map((point) => (point.kind === 'place' ? ++n : 0))
}
