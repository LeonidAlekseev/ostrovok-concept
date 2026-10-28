import 'server-only'
import { z } from 'zod'
import type { NoiseBand } from '@/lib/features'
import {
  NOISY_CATEGORIES,
  NOISY_PER_CATEGORY,
  NOISY_RADIUS_M,
  NOISE_MAP_RADIUS_M,
  QUIET_SOURCE,
  dayColorLevel,
  dayEstimate,
  facadeOf,
  noisyRank,
  type HotelNoise,
  type NoiseMapIndicator,
  type NoisyCategory,
} from '@/lib/noise'
import { anonClient, catalogCached, readOrNull, warnShort, type AnonClient, type HotelPoint } from './anon'

/**
 * «Шум и окружение» of a real hotel for its page and for Эвал (`HotelNoise`): the EEA bands at its facade by layer
 * (`hotel_noise_facade`) and the loud places of the OSM cache around it (`osm_places_near_facade`), and the noise around it for the
 * map: the day estimate of the pieces of `hotel_noise_day`, the Lnight contours of `hotel_geo_features` and the quiet of
 * `hotel_noise_quiet`, computed ahead into `hotel_noise_maps` (`hotel_noise_map`) and computed now only for a point
 * without one. Read with the anon key and cached with the catalogue; a synthetic hotel, a database without the
 * functions or a failure read as `null`, and the page and Эвал say they do not know.
 */

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
 * The loud places of an `osm_places_near_facade` answer, nearest first; a place of several categories is listed once, under
 * the first of them in `NOISY_CATEGORIES` (a bar that serves food is a bar). None, with no category covered, for an answer it cannot read.
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
    .sort((a, b) => a.distance_m - b.distance_m || noisyRank(a.category) - noisyRank(b.category))
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

const readNoise = catalogCached(
  ['hotel-noise', 'facade'],
  async (_hotelId: string, lat: number, lon: number): Promise<HotelNoise> => {
    const db = anonClient()
    const [facade, near] = await Promise.all([
      db.rpc('hotel_noise_facade', { lat, lon }),
      db.rpc('osm_places_near_facade', {
        lat,
        lon,
        radius_m: NOISY_RADIUS_M,
        wanted: [...NOISY_CATEGORIES],
        per_category: NOISY_PER_CATEGORY,
      }),
    ])
    if (facade.error) throw facade.error
    // Without the places the bands still stand: the page says it has no data of OSM.
    return { ...facadeOf(facade.data), ...placesOf(near.error ? null : near.data) }
  },
)

/** The noise of the real hotel, or `null` when it cannot be read. */
export const loadHotelNoise = (hotel: HotelPoint): Promise<HotelNoise | null> =>
  readOrNull(hotel.id, 'hotel noise', () => readNoise(hotel.id, hotel.lat, hotel.lon))

/**
 * A shape of the map, cut to the circle: a band of a layer's Lnight; a piece of a layer with one Lden and one Lnight
 * band and the day estimate of the two (`db_max` `null` for an estimate open at the top, both bounds `null` when the
 * pair fits no day); or the quiet below 40 dB (`source` `quiet`). `level` is the dB the shape is coloured by: the band's
 * lower bound or the estimate's `dayColorLevel`, `null` for the quiet and for a piece without an estimate.
 */
export interface NoiseMapFeature {
  type: 'Feature'
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
  properties: {
    source: string
    indicator: NoiseMapIndicator
    db_min: number | null
    db_max: number | null
    level: number | null
  }
}

export interface NoiseMap {
  type: 'FeatureCollection'
  features: NoiseMapFeature[]
}

const geometry = z.object({ type: z.enum(['Polygon', 'MultiPolygon']), coordinates: z.unknown() })
const db = z.number().nullable()
const mapFeature = z.object({
  geometry,
  properties: z.object({
    layer: z.literal('noise'),
    source: z.string(),
    indicator: z.enum(['Lden', 'Lnight']),
    db_min: db,
    db_max: db,
  }),
})
const dayPiece = z.object({
  geometry,
  properties: z.object({
    layer: z.literal('noise'),
    source: z.string(),
    lden_min: db,
    lden_max: db,
    lnight_min: db,
    lnight_max: db,
  }),
})

/** Coordinates to 5 decimals (~1 m): the contours of 5 dB bands need no more, and the map loads faster. */
const rounded = (value: unknown): unknown =>
  Array.isArray(value) ? value.map(rounded) : typeof value === 'number' ? Math.round(value * 1e5) / 1e5 : value

const shape = (
  { type, coordinates }: z.infer<typeof geometry>,
  properties: NoiseMapFeature['properties'],
): NoiseMapFeature => ({ type: 'Feature', geometry: { type, coordinates: rounded(coordinates) }, properties })

/** The Lnight bands from 40 dB of `hotel_geo_features` (the buildings, Lden and the bands below 40 dB left out). */
const nightOf = (value: unknown): NoiseMapFeature[] => {
  const parsed = mapFeature.safeParse(value)
  if (!parsed.success) return []
  const { source, indicator, db_min, db_max } = parsed.data.properties
  if (indicator !== 'Lnight' || db_min === null) return []
  return [shape(parsed.data.geometry, { source, indicator, db_min, db_max, level: db_min })]
}

/**
 * The quiet of `hotel_noise_quiet`: Lnight's as it is; Lden's as the day's, for the day level is below the Lden when
 * the evening is as loud as the day (`dayLevel`), so below 40 dB where the Lden is.
 */
const quietOf = (value: unknown): NoiseMapFeature[] => {
  const parsed = mapFeature.safeParse(value)
  if (!parsed.success || parsed.data.properties.source !== QUIET_SOURCE) return []
  const { indicator, db_max } = parsed.data.properties
  return [
    shape(parsed.data.geometry, {
      source: QUIET_SOURCE,
      indicator: indicator === 'Lden' ? 'Lday' : 'Lnight',
      db_min: null,
      db_max,
      level: null,
    }),
  ]
}

const band = (min: number | null, max: number | null): NoiseBand | undefined =>
  min === null && max === null ? undefined : { ...(min !== null && { min }), ...(max !== null && { max }) }

/** A piece of `hotel_noise_day` with the day estimate of its two bands, rounded to whole dB. */
const dayOf = (value: unknown): NoiseMapFeature[] => {
  const parsed = dayPiece.safeParse(value)
  if (!parsed.success) return []
  const { source, lden_min, lden_max, lnight_min, lnight_max } = parsed.data.properties
  const day = dayEstimate(band(lden_min, lden_max), band(lnight_min, lnight_max))
  return [
    shape(parsed.data.geometry, {
      source,
      indicator: 'Lday',
      db_min: day && Math.round(day.min),
      db_max: day && Number.isFinite(day.max) ? Math.round(day.max) : null,
      level: day && Math.round(dayColorLevel(day) * 10) / 10,
    }),
  ]
}

/** The map's shapes: the day pieces, the Lnight bands from 40 dB and the quiet of both. */
export function noiseMapOf(
  contours: readonly unknown[],
  quiet: readonly unknown[] = [],
  day: readonly unknown[] = [],
): NoiseMap {
  return {
    type: 'FeatureCollection',
    features: [...day.flatMap(dayOf), ...contours.flatMap(nightOf), ...quiet.flatMap(quietOf)],
  }
}

const features = z.object({ features: z.array(z.unknown()) })
/** A map of `hotel_noise_map`: the three parts as their functions give them. */
const storedMap = z.object({ contours: z.array(z.unknown()), quiet: z.array(z.unknown()), day: z.array(z.unknown()) })

/** The map computed from the contours on this request: three intersections of the EEA polygons, a second or more. */
async function computeNoiseMap(db: AnonClient, lat: number, lon: number): Promise<NoiseMap> {
  const args = { lat, lon, radius_m: NOISE_MAP_RADIUS_M }
  const [contours, quiet, day] = await Promise.all([
    db.rpc('hotel_geo_features', args),
    db.rpc('hotel_noise_quiet', args),
    db.rpc('hotel_noise_day', args),
  ])
  // The day is the map's default: a map without it is not cached, the next request asks again.
  if (contours.error) throw contours.error
  if (day.error) throw day.error
  // Without the quiet the louder shapes still stand: the map leaves the quiet uncoloured.
  if (quiet.error) warnShort('noise map: no quiet', quiet.error)
  return noiseMapOf(
    features.parse(contours.data).features,
    quiet.error ? [] : (features.safeParse(quiet.data).data?.features ?? []),
    features.parse(day.data).features,
  )
}

/**
 * The map of `hotel_noise_maps`, computed ahead by `npm run db:features` (a few ms instead of seconds under load), or
 * the one computed now when the point has none yet (a new hotel, one that moved) or the database has no such function.
 * Both give the same shapes: the stored contours are the Lnight bands `nightOf` keeps anyway.
 */
const readNoiseMap = catalogCached(
  ['hotel-noise-map', 'day'],
  async (_hotelId: string, lat: number, lon: number): Promise<NoiseMap> => {
    const db = anonClient()
    const { data, error } = await db.rpc('hotel_noise_map', { lat, lon, radius_m: NOISE_MAP_RADIUS_M })
    const stored = error ? null : storedMap.safeParse(data).data
    if (stored) return noiseMapOf(stored.contours, stored.quiet, stored.day)
    if (error) warnShort('noise map: none stored, computing', error)
    return computeNoiseMap(db, lat, lon)
  },
)

/** The noise contours around the real hotel, or `null` when they cannot be read. */
export const loadNoiseMap = (hotel: HotelPoint): Promise<NoiseMap | null> =>
  readOrNull(hotel.id, 'noise map', () => readNoiseMap(hotel.id, hotel.lat, hotel.lon))
