import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import type { Database } from '@/lib/db/database.types'
import type { NoiseBand } from '@/lib/features'
import {
  NOISY_CATEGORIES,
  NOISY_PER_CATEGORY,
  NOISY_RADIUS_M,
  NOISE_MAP_RADIUS_M,
  QUIET_SOURCE,
  louderSource,
  type HotelNoise,
  type NoisyCategory,
  type SourceNoise,
} from '@/lib/noise'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'
import { CATALOG_LIFETIME, CATALOG_TAG } from './catalog'

/**
 * «Шум и окружение» of a real hotel for its page and for Эвал (`HotelNoise`): the EEA bands at its point by layer
 * (`hotel_geo`) and the loud places of the OSM cache around it (`osm_places_near`), and the noise contours around it
 * for the map (`hotel_geo_features`). Read with the anon key and cached with the catalogue; a synthetic hotel, a
 * database without the functions or a failure read as `null`, and the page and Эвал say they do not know.
 */

const database = () =>
  createClient<Database>(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })

const isRealHotel = (id: string) => isSupabaseConfigured && /^ota-\d{1,15}$/.test(id)

/** A row of `hotel_geo().noise`. */
const geoBand = z.object({
  source: z.string(),
  indicator: z.enum(['Lden', 'Lnight']),
  db_min: z.number().nullable(),
  db_max: z.number().nullable(),
})
const hotelGeo = z.object({ noise: z.array(z.unknown()) })

const bandOf = (row: z.infer<typeof geoBand>): NoiseBand => ({
  ...(row.db_min !== null && { min: row.db_min }),
  ...(row.db_max !== null && { max: row.db_max }),
})

/** The layers of `hotel_geo().noise`, each with its Lden and Lnight band, the louder first (`louderSource`). */
export function sourcesOf(rows: readonly unknown[]): SourceNoise[] {
  const bySource = new Map<string, SourceNoise>()
  for (const value of rows) {
    const parsed = geoBand.safeParse(value)
    if (!parsed.success || (parsed.data.db_min === null && parsed.data.db_max === null)) continue
    const row = parsed.data
    const source = bySource.get(row.source) ?? { source: row.source }
    source[row.indicator === 'Lden' ? 'lden' : 'lnight'] = bandOf(row)
    bySource.set(row.source, source)
  }
  return [...bySource.values()].sort(louderSource)
}

const NOISY = new Set<string>(NOISY_CATEGORIES)

const nearPlace = z.object({
  category: z.string(),
  osm_type: z.string(),
  osm_id: z.number(),
  name: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  distance_m: z.number(),
})
const nearAnswer = z.object({ covered: z.array(z.string()), places: z.array(z.unknown()) })

/**
 * The loud places of an `osm_places_near` answer, nearest first; a place of several categories is listed once, under
 * the first it was found for. None, with no category covered, for an answer it cannot read.
 */
export function placesOf(answer: unknown): Pick<HotelNoise, 'places' | 'placesCovered'> {
  const parsed = nearAnswer.safeParse(answer)
  if (!parsed.success) return { places: [], placesCovered: [] }
  const seen = new Set<string>()
  const places = parsed.data.places
    .flatMap((value) => {
      const place = nearPlace.safeParse(value)
      return place.success && NOISY.has(place.data.category) ? [place.data] : []
    })
    .sort((a, b) => a.distance_m - b.distance_m)
    .filter((p) => {
      const key = `${p.osm_type}/${p.osm_id}`
      return !seen.has(key) && Boolean(seen.add(key))
    })
    .map((p) => ({
      category: p.category as NoisyCategory,
      name: p.name,
      distanceM: p.distance_m,
      lat: p.lat,
      lon: p.lon,
    }))
  return { places, placesCovered: parsed.data.covered.filter((c): c is NoisyCategory => NOISY.has(c)) }
}

const readNoise = unstable_cache(
  async (_hotelId: string, lat: number, lon: number): Promise<HotelNoise> => {
    const db = database()
    const [geo, near] = await Promise.all([
      db.rpc('hotel_geo', { lat, lon }),
      db.rpc('osm_places_near', {
        lat,
        lon,
        radius_m: NOISY_RADIUS_M,
        wanted: [...NOISY_CATEGORIES],
        per_category: NOISY_PER_CATEGORY,
      }),
    ])
    if (geo.error) throw geo.error
    // Without the places the bands still stand: the page says it has no data of OSM.
    return { sources: sourcesOf(hotelGeo.parse(geo.data).noise), ...placesOf(near.error ? null : near.data) }
  },
  [CATALOG_TAG, 'hotel-noise'],
  { tags: [CATALOG_TAG], revalidate: CATALOG_LIFETIME },
)

const warn = (what: string, error: unknown) =>
  // The kind and the provider's short message only.
  console.warn(`${what} (${String((error as { message?: unknown })?.message ?? error).slice(0, 200)})`)

/** The noise of the real hotel, or `null` when it cannot be read. */
export async function loadHotelNoise(hotel: { id: string; lat: number; lon: number }): Promise<HotelNoise | null> {
  if (!isRealHotel(hotel.id)) return null
  try {
    return await readNoise(hotel.id, hotel.lat, hotel.lon)
  } catch (error) {
    warn(`hotel noise: none for ${hotel.id}`, error)
    return null
  }
}

/** A contour of the map: one band of one layer and indicator, cut to the circle. */
export interface NoiseMapFeature {
  type: 'Feature'
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
  properties: { source: string; indicator: 'Lden' | 'Lnight'; db_min: number | null; db_max: number | null }
}

export interface NoiseMap {
  type: 'FeatureCollection'
  features: NoiseMapFeature[]
}

const mapFeature = z.object({
  geometry: z.object({ type: z.enum(['Polygon', 'MultiPolygon']), coordinates: z.unknown() }),
  properties: z.object({
    layer: z.literal('noise'),
    source: z.string(),
    indicator: z.enum(['Lden', 'Lnight']),
    db_min: z.number().nullable(),
    db_max: z.number().nullable(),
  }),
})

/** Coordinates to 5 decimals (~1 m): the contours of 5 dB bands need no more, and the map loads faster. */
const rounded = (value: unknown): unknown =>
  Array.isArray(value) ? value.map(rounded) : typeof value === 'number' ? Math.round(value * 1e5) / 1e5 : value

const featureOf = (value: unknown): NoiseMapFeature[] => {
  const parsed = mapFeature.safeParse(value)
  if (!parsed.success) return []
  const { geometry, properties } = parsed.data
  const { source, indicator, db_min, db_max } = properties
  return [
    {
      type: 'Feature' as const,
      geometry: { type: geometry.type, coordinates: rounded(geometry.coordinates) },
      properties: { source, indicator, db_min, db_max },
    },
  ]
}

/**
 * The map's contours: the bands from 40 dB of `hotel_geo_features().features` (the buildings and the layers' bands
 * below 40 dB, which cover the louder bands of the other layers, are left out) and the quiet of `hotel_noise_quiet()`.
 */
export function noiseMapOf(contours: readonly unknown[], quiet: readonly unknown[] = []): NoiseMap {
  return {
    type: 'FeatureCollection',
    features: [
      ...contours.flatMap(featureOf).filter((f) => f.properties.db_min !== null),
      ...quiet.flatMap(featureOf).filter((f) => f.properties.source === QUIET_SOURCE),
    ],
  }
}

const readNoiseMap = unstable_cache(
  async (_hotelId: string, lat: number, lon: number): Promise<NoiseMap> => {
    const db = database()
    const args = { lat, lon, radius_m: NOISE_MAP_RADIUS_M }
    const [contours, quiet] = await Promise.all([db.rpc('hotel_geo_features', args), db.rpc('hotel_noise_quiet', args)])
    if (contours.error) throw contours.error
    const features = z.object({ features: z.array(z.unknown()) })
    // Without the quiet the louder bands still stand: the map leaves the quiet uncoloured.
    if (quiet.error) warn('noise map: no quiet', quiet.error)
    return noiseMapOf(
      features.parse(contours.data).features,
      quiet.error ? [] : (features.safeParse(quiet.data).data?.features ?? []),
    )
  },
  [CATALOG_TAG, 'hotel-noise-map', 'quiet'],
  { tags: [CATALOG_TAG], revalidate: CATALOG_LIFETIME },
)

/** The noise contours around the real hotel, or `null` when they cannot be read. */
export async function loadNoiseMap(hotel: { id: string; lat: number; lon: number }): Promise<NoiseMap | null> {
  if (!isRealHotel(hotel.id)) return null
  try {
    return await readNoiseMap(hotel.id, hotel.lat, hotel.lon)
  } catch (error) {
    warn(`noise map: none for ${hotel.id}`, error)
    return null
  }
}
