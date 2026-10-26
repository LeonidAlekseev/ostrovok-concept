/**
 * Distances on the Earth for the geo tools (src/lib/geo), ported from osmmcp's `pkg/geo` (MIT, NERV Systems). No
 * `server-only`: the loading script uses it too.
 */

export interface LatLon {
  lat: number
  lon: number
}

/** A GeoJSON line, `[lon, lat]` pairs: MapLibre draws it as is. */
export interface LineString {
  type: 'LineString'
  coordinates: [number, number][]
}

/** The mean radius of the Earth, metres (osmmcp `EarthRadius`). */
export const EARTH_RADIUS_M = 6_371_000

/** Walking speed for the time «пешком» of a straight line: 5 km/h. */
export const WALK_SPEED_MPS = 5000 / 3600

const rad = (deg: number) => (deg * Math.PI) / 180

/** The great-circle distance between two points, metres. */
export function haversineMeters(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Seconds on foot for `meters` at `WALK_SPEED_MPS`. */
export const walkSeconds = (meters: number) => Math.round(meters / WALK_SPEED_MPS)

/** A rectangle in degrees. */
export interface Bbox {
  south: number
  west: number
  north: number
  east: number
}

/**
 * The Valencia loaded in advance: all its hotels (39.308–39.551 N, −0.492…−0.298 E) with about 3 km around, the city,
 * the coast from Pinedo to El Saler and the Albufera, and Manises airport.
 */
export const VALENCIA_BBOX: Bbox = { south: 39.27, west: -0.53, north: 39.58, east: -0.27 }

export const inBbox = ({ lat, lon }: LatLon, box: Bbox) =>
  lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east

export const isLatLon = ({ lat, lon }: LatLon) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180

/** The straight line between two points as GeoJSON. */
export const straightLine = (from: LatLon, to: LatLon): LineString => ({
  type: 'LineString',
  coordinates: [
    [from.lon, from.lat],
    [to.lon, to.lat],
  ],
})
