import { categorize, type StoredCategory, type Tags } from './categories'
import { VALENCIA_BBOX, type Bbox, type LatLon } from './distance'
import { osmJson, type CallBudget } from './http'
import type { RateGate } from './limits'
import { notFound, ok, type GeoResult } from './result'

/**
 * Nominatim (nominatim.openstreetmap.org): the search of a place by its name, bounded to Valencia, and the address of
 * a point. Ported from osmmcp's `geocode_address` / `reverse_geocode`; the parsing is pure and tested on fixtures.
 */

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org'
export const NOMINATIM_TIMEOUT_MS = 2500
/** Places the search gives back. */
export const GEOCODE_LIMIT = 5

/** A place found by its name. */
export interface GeocodedPlace extends LatLon {
  osmType: 'node' | 'way' | 'relation'
  osmId: number
  name: string | null
  /** The full line of the address, in Russian where OSM has it. */
  displayName: string
  categories: StoredCategory[]
  /** Nominatim's class and type as a tag (`amenity=pharmacy`). */
  tags: Tags
}

export interface ReverseAddress extends LatLon {
  displayName: string
  /** The parts of the address: `road`, `house_number`, `suburb`, `city`, `postcode`… */
  address: Record<string, string>
}

const OSM_TYPES = new Set(['node', 'way', 'relation'])

export function geocodeUrl(query: string, box: Bbox = VALENCIA_BBOX, limit = GEOCODE_LIMIT): string {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: String(limit),
    // Two corners as lon,lat; `bounded` keeps the results inside.
    viewbox: `${box.west},${box.north},${box.east},${box.south}`,
    bounded: '1',
    'accept-language': 'ru',
  })
  return `${NOMINATIM_URL}/search?${params}`
}

export function reverseUrl({ lat, lon }: LatLon): string {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'jsonv2',
    zoom: '18',
    'accept-language': 'ru',
  })
  return `${NOMINATIM_URL}/reverse?${params}`
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

/** The places of a `/search?format=jsonv2` answer; entries without an OSM element or coordinates are left out. */
export function parseSearch(json: unknown): GeocodedPlace[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((entry): GeocodedPlace[] => {
    const item = record(entry)
    const osmType = text(item?.osm_type)
    const osmId = Number(item?.osm_id)
    const lat = Number(item?.lat)
    const lon = Number(item?.lon)
    if (!item || !osmType || !OSM_TYPES.has(osmType) || !Number.isSafeInteger(osmId)) return []
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []
    const key = text(item.category)
    const value = text(item.type)
    const tags: Tags = key && value ? { [key]: value } : {}
    const categories = categorize(tags)
    return [
      {
        osmType: osmType as GeocodedPlace['osmType'],
        osmId,
        name: text(item.name) || null,
        displayName: text(item.display_name) ?? '',
        lat,
        lon,
        categories: categories.length ? categories : ['other'],
        tags,
      },
    ]
  })
}

/** The address of a `/reverse?format=jsonv2` answer; `undefined` for `{"error": "Unable to geocode"}`. */
export function parseReverse(json: unknown): ReverseAddress | undefined {
  const item = record(json)
  if (!item || item.error) return undefined
  const lat = Number(item.lat)
  const lon = Number(item.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined
  const address = Object.fromEntries(
    Object.entries(record(item.address) ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
  return { lat, lon, displayName: text(item.display_name) ?? '', address }
}

export interface NominatimDeps {
  budget: CallBudget
  gate: RateGate
  fetch?: typeof fetch
}

/** Places named `query` in Valencia; `not-found` when Nominatim knows none there. */
export async function nominatimSearch(query: string, deps: NominatimDeps): Promise<GeoResult<GeocodedPlace[]>> {
  const answer = await osmJson({
    service: 'nominatim',
    url: geocodeUrl(query),
    timeoutMs: NOMINATIM_TIMEOUT_MS,
    ...deps,
  })
  if (!answer.ok) return answer
  const places = parseSearch(answer.value)
  return places.length ? ok(places) : notFound(`В Валенсии не нашёл «${query}» в OpenStreetMap.`)
}

/** The address of a point; `not-found` when Nominatim has none (the sea, outside the map). */
export async function nominatimReverse(point: LatLon, deps: NominatimDeps): Promise<GeoResult<ReverseAddress>> {
  const answer = await osmJson({
    service: 'nominatim',
    url: reverseUrl(point),
    timeoutMs: NOMINATIM_TIMEOUT_MS,
    ...deps,
  })
  if (!answer.ok) return answer
  const address = parseReverse(answer.value)
  return address ? ok(address) : notFound('У этой точки нет адреса в OpenStreetMap.')
}
