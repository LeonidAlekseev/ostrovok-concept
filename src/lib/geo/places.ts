import { CATEGORY, type PlaceCategory, type StoredCategory, type Tags } from './categories'
import { haversineMeters, type LatLon } from './distance'
import type { CallBudget } from './http'
import type { GeocodedPlace } from './nominatim'
import type { OsmPlaceRow, OsmType, OverpassArea } from './overpass'
import { outside, type GeoFailure, type GeoResult } from './result'

/**
 * The places near a point: from the cache in PostGIS (Valencia is loaded in advance), and for the categories the
 * cache does not cover there, from Overpass — what it finds and the circle asked are written to the cache for good.
 * The services and the store come as dependencies: src/lib/geo/tools.ts brings the real ones, the tests their own.
 */

export const ATTRIBUTION = '© OpenStreetMap contributors, ODbL 1.0'
/** Overpass is asked online only this far around: farther the query is heavy and the places are not «рядом». */
export const ONLINE_MAX_RADIUS_M = 5000

export interface Place extends LatLon {
  osmType: OsmType
  osmId: number
  name: string | null
  /** The category it was found for. */
  category: StoredCategory
  categories: StoredCategory[]
  tags: Tags
  /** From the asked point to the place's shape (the edge of a beach, the line of the coast), metres. */
  distanceM: number
  /** The shape's point nearest to the asked one: where a route to the place ends. */
  near: LatLon
  origin: 'preload' | 'online'
  attribution: string
}

export interface CachedNear {
  /** The asked categories the loaded areas cover for the whole circle. */
  covered: PlaceCategory[]
  places: Place[]
}

/** The cache: reads through the RPCs, writes with the service role (src/lib/geo/store.ts). */
export interface PlaceStore {
  near(
    point: LatLon,
    radiusM: number,
    categories: readonly PlaceCategory[],
    perCategory: number,
    budget: CallBudget,
  ): Promise<GeoResult<CachedNear>>
  /** Places whose name is `name` exactly, any case, in any of its languages. */
  named(name: string, budget: CallBudget): Promise<GeoResult<GeocodedPlace[]>>
  /** Writes the rows; `false` when it could not (no service key, an error). */
  save(rows: readonly OsmPlaceRow[], origin: 'preload' | 'online'): Promise<boolean>
  /** Records that `categories` are loaded for the circle. */
  addArea(point: LatLon, radiusM: number, categories: readonly PlaceCategory[]): Promise<boolean>
}

export type OverpassAsk = (
  categories: readonly PlaceCategory[],
  area: OverpassArea,
  budget: CallBudget,
) => Promise<GeoResult<OsmPlaceRow[]>>

export interface NearbyGroup {
  category: PlaceCategory
  label: string
  /** `none`: checked, nothing within the radius; `unchecked`: neither the cache nor OSM could say. */
  status: 'found' | 'none' | 'unchecked'
  places: Place[]
  /** Why the category is not fully checked: the cache had no data and OSM did not answer. */
  failure?: GeoFailure
}

export interface Nearby {
  point: LatLon
  radiusM: number
  groups: NearbyGroup[]
  attribution: string
}

export interface NearbyDeps {
  store: PlaceStore
  overpass: OverpassAsk
  budget: CallBudget
}

/** The rows Overpass gave as places of `categories` within the circle, nearest first, measured to the centre. */
export function rowsNear(
  rows: readonly OsmPlaceRow[],
  point: LatLon,
  radiusM: number,
  categories: readonly PlaceCategory[],
  perCategory: number,
): Place[] {
  return categories.flatMap((category) =>
    rows
      .filter((row) => row.categories.includes(category))
      .map((row) => ({ row, distanceM: Math.round(haversineMeters(point, row)) }))
      .filter(({ distanceM }) => distanceM <= radiusM)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, perCategory)
      .map(({ row, distanceM }) => ({
        osmType: row.osm_type,
        osmId: row.osm_id,
        name: row.name,
        category,
        categories: row.categories,
        tags: row.tags,
        lat: row.lat,
        lon: row.lon,
        distanceM,
        near: { lat: row.lat, lon: row.lon },
        origin: 'online' as const,
        attribution: ATTRIBUTION,
      })),
  )
}

/**
 * The `perCategory` nearest places of each of `categories` within `radiusM`. The cache answers for the categories
 * its areas cover (an empty answer there is a true «рядом нет»); the rest are asked of Overpass once, and what it
 * gives is written to the cache with the circle. A category neither could check is `unchecked` with the failure.
 */
export async function nearbyPlaces(
  point: LatLon,
  categories: readonly PlaceCategory[],
  { radiusM, perCategory }: { radiusM: number; perCategory: number },
  { store, overpass, budget }: NearbyDeps,
): Promise<Nearby> {
  const cached = await store.near(point, radiusM, categories, perCategory, budget)
  const covered = new Set(cached.ok ? cached.value.covered : [])
  let places = cached.ok ? cached.value.places : []
  const missing = categories.filter((c) => !covered.has(c))
  const checked = new Set(covered)
  let failure: GeoFailure | undefined = cached.ok ? undefined : cached

  if (missing.length && radiusM > ONLINE_MAX_RADIUS_M) {
    failure = outside(
      `Этих мест нет в загруженных данных, а онлайн ищу только в радиусе ${ONLINE_MAX_RADIUS_M / 1000} км.`,
    )
  } else if (missing.length) {
    const online = await overpass(missing, { around: { ...point, radiusM } }, budget)
    if (online.ok) {
      missing.forEach((c) => checked.add(c))
      failure = undefined
      const saved = online.value.length === 0 || (await store.save(online.value, 'online'))
      if (saved) await store.addArea(point, radiusM, missing)
      // The cache measures to the shapes; without it the rows are measured to their centres.
      const again =
        saved && online.value.length ? await store.near(point, radiusM, missing, perCategory, budget) : undefined
      const found = again?.ok ? again.value.places : rowsNear(online.value, point, radiusM, missing, perCategory)
      places = [...places.filter((p) => !missing.includes(p.category as PlaceCategory)), ...found]
    } else failure = online
  }

  const groups = categories.map((category): NearbyGroup => {
    const mine = places.filter((p) => p.category === category).sort((a, b) => a.distanceM - b.distanceM)
    const done = checked.has(category)
    return {
      category,
      label: CATEGORY[category].label,
      status: mine.length ? 'found' : done ? 'none' : 'unchecked',
      places: mine,
      ...(!done && failure && { failure }),
    }
  })
  return { point, radiusM, groups, attribution: ATTRIBUTION }
}

export interface Geocoded {
  /** `cache`: the name was in the cache; `online`: Nominatim found it and the cache has it now. */
  source: 'cache' | 'online'
  places: GeocodedPlace[]
  attribution: string
}

/** The row of a geocoded place for the cache: its point and Nominatim's class and type as the tag. */
export const geocodedRow = (place: GeocodedPlace): OsmPlaceRow => ({
  osm_type: place.osmType,
  osm_id: place.osmId,
  name: place.name,
  categories: place.categories,
  tags: place.tags,
  lat: place.lat,
  lon: place.lon,
  geom: `SRID=4326;POINT(${place.lon} ${place.lat})`,
})

/** A place in Valencia by its name: the cache by the exact name, else Nominatim, whose finds are written for good. */
export async function geocode(
  query: string,
  {
    store,
    search,
    budget,
  }: { store: PlaceStore; search: (query: string) => Promise<GeoResult<GeocodedPlace[]>>; budget: CallBudget },
): Promise<GeoResult<Geocoded>> {
  const cached = await store.named(query, budget)
  if (cached.ok && cached.value.length)
    return { ok: true, value: { source: 'cache', places: cached.value, attribution: ATTRIBUTION } }
  const found = await search(query)
  if (!found.ok) return found
  await store.save(found.value.map(geocodedRow), 'online')
  return { ok: true, value: { source: 'online', places: found.value, attribution: ATTRIBUTION } }
}
