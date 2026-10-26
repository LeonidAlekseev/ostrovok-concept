import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import type { Database } from '@/lib/db/database.types'
import { haversineMeters } from '@/lib/geo/distance'
import type { HotelBuilding, NearbyPlace } from '@/lib/hotelDetails'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'
import {
  LANDMARK_RADIUS_M,
  observerOf,
  pointAt,
  RAY_BEARINGS,
  RAY_LENGTH_M,
  SEA_RADIUS_M,
  bearingDeg,
  seaPoints,
  type HotelView,
  type SightLine,
  type ViewTarget,
} from '@/lib/view'
import { CATALOG_LIFETIME, CATALOG_TAG } from './catalog'

/**
 * «Вид из отеля» of a real hotel for its page and for Эвал (`HotelView`, src/lib/view.ts): the lines of sight of
 * `hotel_view_lines` from a floor of the hotel's building (EUBUCCO) — the rays of the horizon, the points of the coast
 * of OSM (`osm_places_near` `sea`), the attractions of OSM and the places of Ostrovok — and the buildings around the hotel
 * for the map (`hotel_geo_features`). Read with the anon key and cached with the catalogue, one entry a hotel and floor;
 * a hotel without a building's height, a database without the function or a failure read as `null`, and the page and
 * Эвал say «недостаточно данных».
 */

const database = () =>
  createClient<Database>(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })

type Db = ReturnType<typeof database>

const isRealHotel = (id: string) => isSupabaseConfigured && /^ota-\d{1,15}$/.test(id)

/** At most this many lines a call of `hotel_view_lines`. */
const LINES_PER_CALL = 160

const lineRow = z.object({
  i: z.number().int(),
  distance_m: z.number(),
  checked: z.boolean(),
  crossed: z.number(),
  max_angle: z.number().nullable(),
  max_angle_upper: z.number().nullable(),
  first_above_m: z.number().nullable(),
  covered_m: z.number().nullable(),
  blocker: z
    .object({ id: z.string(), distance_m: z.number(), height: z.number(), height_source: z.string().nullable() })
    .nullable(),
  target_building: z
    .object({ id: z.string(), height: z.number().nullable(), height_source: z.string().nullable() })
    .nullable(),
})
const linesAnswer = z.object({ lines: z.array(z.unknown()) })

/** The lines of a `hotel_view_lines` answer by the index of their target; `null` for one it lacks or cannot read. */
export function linesOf(answer: unknown, count: number): (SightLine | null)[] {
  const lines: (SightLine | null)[] = Array.from({ length: count }, () => null)
  const parsed = linesAnswer.safeParse(answer)
  if (!parsed.success) return lines
  for (const value of parsed.data.lines) {
    const row = lineRow.safeParse(value)
    if (!row.success || row.data.i < 0 || row.data.i >= count) continue
    const r = row.data
    lines[r.i] = {
      distanceM: r.distance_m,
      checked: r.checked,
      crossed: r.crossed,
      maxAngle: r.max_angle,
      maxAngleUpper: r.max_angle_upper,
      firstAboveM: r.first_above_m,
      coveredM: r.covered_m,
      blocker: r.blocker && {
        id: r.blocker.id,
        distanceM: r.blocker.distance_m,
        heightM: r.blocker.height,
        estimated: r.blocker.height_source === 'estimated',
      },
      targetBuilding: r.target_building && {
        id: r.target_building.id,
        heightM: r.target_building.height,
        estimated: r.target_building.height_source === 'estimated',
      },
    }
  }
  return lines
}

interface Point {
  lat: number
  lon: number
}

/** The lines from the hotel's window `eyeM` above the ground to the points, a call per `LINES_PER_CALL`. */
async function measure(db: Db, hotel: Point, eyeM: number, points: readonly Point[]): Promise<(SightLine | null)[]> {
  const batches: Point[][] = []
  for (let i = 0; i < points.length; i += LINES_PER_CALL) batches.push(points.slice(i, i + LINES_PER_CALL))
  const answers = await Promise.all(
    batches.map(async (batch) => {
      const { data, error } = await db.rpc('hotel_view_lines', {
        lat: hotel.lat,
        lon: hotel.lon,
        eye_m: eyeM,
        targets: batch.map(({ lat, lon }) => ({ lat, lon })),
      })
      if (error) throw error
      return linesOf(data, batch.length)
    }),
  )
  return answers.flat()
}

const nearPlace = z.object({
  category: z.string(),
  name: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  near_lat: z.number(),
  near_lon: z.number(),
  distance_m: z.number(),
})
const nearAnswer = z.object({ covered: z.array(z.string()), places: z.array(z.unknown()) })

/** The places of an `osm_places_near` answer and whether the cache covers their category; none for a bad answer. */
export function nearOf(answer: unknown, category: string) {
  const parsed = nearAnswer.safeParse(answer)
  if (!parsed.success) return { covered: false, places: [] }
  const places = parsed.data.places.flatMap((value) => {
    const place = nearPlace.safeParse(value)
    return place.success && place.data.category === category ? [place.data] : []
  })
  return { covered: parsed.data.covered.includes(category), places }
}

/** The Ostrovok places the view checks: not the stations and airports (under the ground or far), within the radius. */
export const ostrovokLandmarks = (places: readonly NearbyPlace[]) =>
  places
    .filter((p) => !p.transport && p.kind !== 'Станция' && p.kind !== 'Аэропорт' && p.distanceM <= LANDMARK_RADIUS_M)
    .slice(0, 10)
    .map((p) => ({ name: p.name, category: p.kind.toLocaleLowerCase('ru'), lat: p.lat, lon: p.lon }))

type Landmark = ReturnType<typeof ostrovokLandmarks>[number]

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('ru') === b.trim().toLocaleLowerCase('ru')

type Measured = Omit<HotelView, 'observer' | 'floors' | 'windowSides'>

const readView = unstable_cache(
  async (_hotelId: string, lat: number, lon: number, eyeM: number, ostrovok: Landmark[]): Promise<Measured> => {
    const db = database()
    const hotel = { lat, lon }
    const rayPoints = RAY_BEARINGS.map((bearing) => pointAt(hotel, bearing, RAY_LENGTH_M))
    const [rays, sea, attractions] = await Promise.all([
      measure(db, hotel, eyeM, rayPoints),
      db.rpc('osm_places_near', { lat, lon, radius_m: SEA_RADIUS_M, wanted: ['sea'], per_category: 20 }),
      db.rpc('osm_places_near', { lat, lon, radius_m: LANDMARK_RADIUS_M, wanted: ['attraction'], per_category: 10 }),
    ])
    const coast = nearOf(sea.error ? null : sea.data, 'sea')
    const seaTargets: Omit<ViewTarget, 'line'>[] = seaPoints(
      hotel,
      coast.places.map((p) => ({ lat: p.near_lat, lon: p.near_lon, distanceM: p.distance_m })),
    ).map((p) => ({ kind: 'sea', name: 'Берег моря', category: 'море', ...p }))
    const osm = nearOf(attractions.error ? null : attractions.data, 'attraction').places.filter(
      (p, i, all) => p.name && all.findIndex((q) => q.name && sameName(q.name, p.name!)) === i,
    )
    const landmarks: Omit<ViewTarget, 'line'>[] = [
      ...ostrovok.map((p) => ({ kind: 'ostrovok' as const, ...p })),
      ...osm
        .filter((p) => !ostrovok.some((o) => sameName(o.name, p.name!)))
        .map((p) => ({
          kind: 'attraction' as const,
          name: p.name!,
          category: 'достопримечательность',
          lat: p.lat,
          lon: p.lon,
        })),
    ].map((p) => ({
      ...p,
      distanceM: Math.round(haversineMeters(hotel, p)),
      bearing: bearingDeg(hotel, p),
    }))
    const targets = [...seaTargets, ...landmarks]
    const lines = await measure(db, hotel, eyeM, targets)
    const measured = targets.map((t, i): ViewTarget => ({ ...t, line: lines[i] }))
    return {
      rays: RAY_BEARINGS.flatMap((bearing, i) => (rays[i] ? [{ bearing, line: rays[i] }] : [])),
      sea: measured.filter((t) => t.kind === 'sea'),
      // Without the coast loaded nothing is known; with it loaded and no point within the radius, there is no sea near.
      seaChecked: !sea.error && (coast.covered || coast.places.length > 0),
      landmarks: measured.filter((t) => t.kind !== 'sea').sort((a, b) => a.distanceM - b.distanceM),
    }
  },
  [CATALOG_TAG, 'hotel-view'],
  { tags: [CATALOG_TAG], revalidate: CATALOG_LIFETIME },
)

const warn = (what: string, error: unknown) =>
  // The kind and the provider's short message only.
  console.warn(`${what} (${String((error as { message?: unknown })?.message ?? error).slice(0, 200)})`)

/**
 * The view from `floor` (the top one by default) of the real hotel's building, or `null` when the building has no
 * height (none in EUBUCCO, or a doubtful one: `details.building` is null then) or the lines cannot be read.
 */
export async function loadHotelView(
  hotel: { id: string; lat: number; lon: number },
  building: HotelBuilding | null | undefined,
  nearby: readonly NearbyPlace[],
  floor?: number | null,
): Promise<HotelView | null> {
  const observer = observerOf(building, floor)
  if (!isRealHotel(hotel.id) || !observer) return null
  try {
    const eyeM = Math.round(observer.eyeM * 10) / 10
    const measured = await readView(hotel.id, hotel.lat, hotel.lon, eyeM, ostrovokLandmarks(nearby))
    return {
      observer,
      floors: observer.floors ? Array.from({ length: observer.floors }, (_, i) => i + 1) : [],
      ...measured,
      windowSides: [],
    }
  } catch (error) {
    warn(`hotel view: none for ${hotel.id}`, error)
    return null
  }
}

/** The lines from the hotel's window to places found by Эвал's geo tools; `null` when they cannot be read. */
export async function checkViewPoints(
  hotel: { id: string; lat: number; lon: number },
  eyeM: number,
  points: readonly Point[],
): Promise<(SightLine | null)[] | null> {
  if (!isRealHotel(hotel.id) || points.length === 0) return null
  try {
    return await measure(database(), hotel, eyeM, points)
  } catch (error) {
    warn(`hotel view: no lines for ${hotel.id}`, error)
    return null
  }
}

/** The radius of the map's buildings, m: the street and the blocks around, ~250 KB. */
export const VIEW_MAP_RADIUS_M = 250

/** A building of the map: EUBUCCO's footprint and height. */
export interface ViewMapBuilding {
  type: 'Feature'
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
  properties: { id: string; height: number; estimated: boolean }
}

export interface ViewMap {
  type: 'FeatureCollection'
  features: ViewMapBuilding[]
}

const mapBuilding = z.object({
  geometry: z.object({ type: z.enum(['Polygon', 'MultiPolygon']), coordinates: z.unknown() }),
  properties: z.object({
    layer: z.literal('building'),
    id: z.string(),
    height: z.number(),
    height_source: z.string().nullable(),
  }),
})

/** Coordinates to 6 decimals as the database gives them, cut to 5 (~1 m): a footprint needs no more. */
const rounded = (value: unknown): unknown =>
  Array.isArray(value) ? value.map(rounded) : typeof value === 'number' ? Math.round(value * 1e5) / 1e5 : value

/** The buildings with a height of `hotel_geo_features().features`; the noise is left out. */
export function viewMapOf(features: readonly unknown[]): ViewMap {
  return {
    type: 'FeatureCollection',
    features: features.flatMap((value) => {
      const parsed = mapBuilding.safeParse(value)
      if (!parsed.success) return []
      const { geometry, properties } = parsed.data
      return [
        {
          type: 'Feature' as const,
          geometry: { type: geometry.type, coordinates: rounded(geometry.coordinates) },
          properties: {
            id: properties.id,
            height: properties.height,
            estimated: properties.height_source === 'estimated',
          },
        },
      ]
    }),
  }
}

const readViewMap = unstable_cache(
  async (_hotelId: string, lat: number, lon: number): Promise<ViewMap> => {
    const { data, error } = await database().rpc('hotel_geo_features', { lat, lon, radius_m: VIEW_MAP_RADIUS_M })
    if (error) throw error
    return viewMapOf(z.object({ features: z.array(z.unknown()) }).parse(data).features)
  },
  [CATALOG_TAG, 'hotel-view-map'],
  { tags: [CATALOG_TAG], revalidate: CATALOG_LIFETIME },
)

/** The buildings around the real hotel for the map of the view, or `null` when they cannot be read. */
export async function loadViewMap(hotel: { id: string; lat: number; lon: number }): Promise<ViewMap | null> {
  if (!isRealHotel(hotel.id)) return null
  try {
    return await readViewMap(hotel.id, hotel.lat, hotel.lon)
  } catch (error) {
    warn(`view map: none for ${hotel.id}`, error)
    return null
  }
}
