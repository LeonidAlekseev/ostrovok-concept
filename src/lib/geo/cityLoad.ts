import type { Bbox, LatLon } from './distance'
import type { OsmPlaceRow } from './overpass'

/**
 * The parameters of loading the places of a city (scripts/load-city-places.ts, scripts/load-osm-places.ts): the
 * rectangle, the centre, the free disk, the city from Nominatim. Pure, so the scripts' arguments are tested here. No
 * `server-only`: only the scripts use it.
 */

/** `south,west,north,east` in degrees → the rectangle; throws a message for a wrong one. */
export function parseBbox(text: string): Bbox {
  const parts = text.split(',').map((part) => Number(part.trim()))
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)))
    throw new Error(`--bbox must be south,west,north,east in degrees, got «${text}»`)
  const [south, west, north, east] = parts
  if (south < -90 || north > 90 || west < -180 || east > 180)
    throw new Error(`--bbox is outside the coordinates: ${text}`)
  if (south >= north || west >= east) throw new Error(`--bbox needs south < north and west < east: ${text}`)
  return { south, west, north, east }
}

/** `lat,lon` → the point; throws a message for a wrong one. */
export function parseLatLon(text: string, flag = '--centre'): LatLon {
  const parts = text.split(',').map((part) => Number(part.trim()))
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n)))
    throw new Error(`${flag} must be lat,lon in degrees, got «${text}»`)
  const [lat, lon] = parts
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error(`${flag} is outside the coordinates: ${text}`)
  return { lat, lon }
}

export const formatBbox = ({ south, west, north, east }: Bbox) => `${south},${west},${north},${east}`

/** The rectangle grown by `km` on every side (a degree of latitude is 111.32 km; of longitude, less by the cosine). */
export function growBbox(box: Bbox, km: number): Bbox {
  const dLat = km / 111.32
  const dLon = km / (111.32 * Math.cos((((box.south + box.north) / 2) * Math.PI) / 180))
  const r = (n: number) => Math.round(n * 1e4) / 1e4
  return {
    south: r(Math.max(-90, box.south - dLat)),
    west: r(Math.max(-180, box.west - dLon)),
    north: r(Math.min(90, box.north + dLat)),
    east: r(Math.min(180, box.east + dLon)),
  }
}

/** The rectangle as an EWKT polygon for `osm_place_areas.area`. */
export const bboxPolygon = ({ south, west, north, east }: Bbox) =>
  `SRID=4326;POLYGON((${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}))`

/** A name for the files of a city: `València` → `valencia`. */
export const citySlug = (city: string) =>
  city
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'city'

/**
 * The disk the load needs: the extract, the file of the node locations of the conversion (about 2.5 times the
 * extract) and a reserve for the JSON and the rest of the machine.
 */
export const requiredFreeBytes = (pbfBytes: number) => Math.ceil(pbfBytes * 4) + 500 * 1024 ** 2

export const isPbfUrl = (url: string) => /^https:\/\/\S+\.osm\.pbf$/.test(url)

export interface NominatimCity extends LatLon {
  name: string
  bbox: Bbox
}

/**
 * The first city, town or administrative area of a Nominatim `/search?format=jsonv2` answer: its point (the centre
 * Nominatim gives) and its bounding box (`[south, north, west, east]` as strings).
 */
export function parseNominatimCity(json: unknown): NominatimCity | undefined {
  if (!Array.isArray(json)) return undefined
  for (const entry of json as Record<string, unknown>[]) {
    const box = entry?.boundingbox
    if (!Array.isArray(box) || box.length !== 4) continue
    const [south, north, west, east] = box.map(Number)
    const lat = Number(entry.lat)
    const lon = Number(entry.lon)
    if (![south, north, west, east, lat, lon].every(Number.isFinite)) continue
    if (!['boundary', 'place'].includes(String(entry.category))) continue
    return { name: String(entry.name ?? entry.display_name ?? ''), lat, lon, bbox: { south, west, north, east } }
  }
  return undefined
}

/**
 * With the centre of the city given, the `centre` category stays only on the `place=city|town` node nearest to it:
 * the other towns of the rectangle are not the centre. A row left without categories is dropped.
 */
export function keepOneCentre(rows: readonly OsmPlaceRow[], centre: LatLon | undefined): OsmPlaceRow[] {
  if (!centre) return [...rows]
  const candidates = rows.filter((row) => row.categories.includes('centre'))
  const distance = (row: OsmPlaceRow) => (row.lat - centre.lat) ** 2 + (row.lon - centre.lon) ** 2
  const nearest = candidates.reduce<OsmPlaceRow | undefined>(
    (best, row) => (!best || distance(row) < distance(best) ? row : best),
    undefined,
  )
  return rows.flatMap((row) => {
    if (row === nearest || !row.categories.includes('centre')) return [row]
    const categories = row.categories.filter((c) => c !== 'centre')
    return categories.length ? [{ ...row, categories }] : []
  })
}
