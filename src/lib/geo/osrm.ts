import { haversineMeters, straightLine, walkSeconds, type LatLon, type LineString } from './distance'
import { osmJson, type CallBudget } from './http'
import type { RateGate } from './limits'
import { notFound, ok, unavailable, type GeoResult } from './result'

/**
 * The routes of OSRM on the FOSSGIS server (routing.openstreetmap.de): on foot (`routed-foot`), ported from osmmcp's
 * `get_route` with GeoJSON instead of a polyline, and by car (`routed-car`) to the far places, the airport. A route
 * the server does not give in time is the straight line, marked «по прямой» with the reason: the distance is still
 * true, the way is not.
 */

/** The profile is in the path; the `driving` segment is the server's fixed placeholder. */
export const OSRM_FOOT_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving'
export const OSRM_CAR_URL = 'https://routing.openstreetmap.de/routed-car/route/v1/driving'
export const OSRM_TIMEOUT_MS = 2500
/** Farther than this nobody walks: the straight line is the answer (the airport from the beach). */
export const MAX_WALK_M = 15_000

/** A route OSRM gave: on foot, or by car without the traffic (its time on empty roads). */
export interface OsrmRoute<K extends 'foot' | 'car'> {
  kind: K
  distanceM: number
  durationS: number
  geometry: LineString
}

export type FootRoute = OsrmRoute<'foot'>
export type CarRoute = OsrmRoute<'car'>

export interface StraightRoute {
  kind: 'straight'
  distanceM: number
  /** At 5 km/h along the straight line: the least the walk takes. */
  durationS: number
  geometry: LineString
  note: 'по прямой'
  /** Why there is no route, for the answer. */
  reason: string
}

export type WalkRoute = FootRoute | StraightRoute

export type DriveRoute = CarRoute | StraightRoute

export const routeUrl = (from: LatLon, to: LatLon, base = OSRM_FOOT_URL) =>
  `${base}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&steps=false&alternatives=false`

const isPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])

/** The first route of an OSRM answer; `NoRoute` is `not-found`, any other code or shape `unavailable`. */
export function parseRoute<K extends 'foot' | 'car' = 'foot'>(
  json: unknown,
  kind = 'foot' as K,
): GeoResult<OsrmRoute<K>> {
  const answer = json as { code?: unknown; routes?: unknown } | null
  if (answer?.code === 'NoRoute')
    return notFound(`${kind === 'foot' ? 'Пешеходный маршрут' : 'Маршрут на машине'} между этими точками не найден.`)
  if (answer?.code !== 'Ok' || !Array.isArray(answer.routes) || answer.routes.length === 0) return unavailable('osrm')
  const route = answer.routes[0] as { distance?: unknown; duration?: unknown; geometry?: { coordinates?: unknown } }
  const coordinates = route.geometry?.coordinates
  if (typeof route.distance !== 'number' || typeof route.duration !== 'number' || !Array.isArray(coordinates))
    return unavailable('osrm')
  return ok({
    kind,
    distanceM: Math.round(route.distance),
    durationS: Math.round(route.duration),
    geometry: { type: 'LineString', coordinates: coordinates.filter(isPair).map(([lon, lat]) => [lon, lat]) },
  })
}

/** The straight line; its time is the walk's at 5 km/h, the least the walk takes. */
export function straightRoute(from: LatLon, to: LatLon, reason: string): StraightRoute {
  const distanceM = Math.round(haversineMeters(from, to))
  return {
    kind: 'straight',
    distanceM,
    durationS: walkSeconds(distanceM),
    geometry: straightLine(from, to),
    note: 'по прямой',
    reason,
  }
}

export interface OsrmDeps {
  budget: CallBudget
  gate: RateGate
  fetch?: typeof fetch
}

/** The walk from `from` to `to`: OSRM's route, or the straight line with the reason when there is none. */
export async function walkingRoute(from: LatLon, to: LatLon, deps: OsrmDeps): Promise<WalkRoute> {
  if (haversineMeters(from, to) > MAX_WALK_M)
    return straightRoute(from, to, 'Слишком далеко для пешей прогулки: расстояние по прямой.')
  const answer = await osmJson({ service: 'osrm', url: routeUrl(from, to), timeoutMs: OSRM_TIMEOUT_MS, ...deps })
  const route = answer.ok ? parseRoute(answer.value) : answer
  return route.ok ? route.value : straightRoute(from, to, route.message)
}

/** The drive from `from` to `to`: OSRM's route by car, or the straight line with the reason when there is none. */
export async function drivingRoute(from: LatLon, to: LatLon, deps: OsrmDeps): Promise<DriveRoute> {
  const answer = await osmJson({
    service: 'osrm',
    url: routeUrl(from, to, OSRM_CAR_URL),
    timeoutMs: OSRM_TIMEOUT_MS,
    ...deps,
  })
  const route = answer.ok ? parseRoute(answer.value, 'car') : answer
  return route.ok ? route.value : straightRoute(from, to, route.message)
}
