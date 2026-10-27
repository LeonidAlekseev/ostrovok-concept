import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import type { Database } from '@/lib/db/database.types'
import { haversineMeters } from '@/lib/geo/distance'
import { mergePlaces } from '@/lib/geo/samePlace'
import type { HotelBuilding, NearbyPlace } from '@/lib/hotelDetails'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'
import {
  LANDMARK_RADIUS_M,
  pointAt,
  RAY_ANGLES,
  RAY_BEARINGS,
  RAY_LENGTH_M,
  SEA_RADIUS_M,
  VIEW_MAP_RADIUS_M,
  bearingDeg,
  seaPoints,
  windowOf,
  type HotelView,
  type SightLine,
  type ViewTarget,
} from '@/lib/view'
import { CATALOG_LIFETIME, CATALOG_TAG } from './catalog'

/**
 * «Вид из отеля» of a real hotel for its page and for Эвал (`HotelView`, src/lib/view.ts): the lines of sight of
 * `hotel_view_eyes` from the hotel, for every floor at once — the rays of the horizon, the points of the coast
 * of OSM (`osm_places_near` `sea`), the attractions of OSM and the places of Ostrovok — and the buildings around the hotel
 * for the map (`hotel_geo_features`). Read with the anon key and cached with the catalogue, one entry a hotel;
 * a hotel without the floors of its window, a database without the function or a failure read as `null`, and the page
 * and Эвал say «нет данных».
 */

const database = () =>
  createClient<Database>(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })

type Db = ReturnType<typeof database>

const isRealHotel = (id: string) => isSupabaseConfigured && /^ota-\d{1,15}$/.test(id)

/** At most this many lines a call of `hotel_view_eyes`. */
const LINES_PER_CALL = 160

const blockerRow = z.object({
  id: z.string(),
  distance_m: z.number(),
  height: z.number(),
  height_source: z.string().nullable(),
  eye_m: z.number(),
  eye_upper_m: z.number(),
})
const eyeRow = z.object({
  eye_m: z.number().nullable(),
  eye_upper_m: z.number().nullable(),
  blockers: z.array(blockerRow),
})
const lineRow = z.object({
  i: z.number().int(),
  distance_m: z.number(),
  checked: z.boolean(),
  crossed: z.number(),
  covered_m: z.number().nullable(),
  eyes: z.array(eyeRow),
  target_building: z
    .object({ id: z.string(), height: z.number().nullable(), height_source: z.string().nullable() })
    .nullable(),
})
const linesAnswer = z.object({ own_building: z.string().nullable().catch(null), lines: z.array(z.unknown()) })

/** The lines of a `hotel_view_eyes` answer by the index of their target; `null` for one it lacks or cannot read. */
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
      coveredM: r.covered_m,
      eyes: r.eyes.map((eye) => ({
        eyeM: eye.eye_m,
        eyeUpperM: eye.eye_upper_m,
        blockers: eye.blockers.map((b) => ({
          id: b.id,
          distanceM: b.distance_m,
          heightM: b.height,
          estimated: b.height_source === 'estimated',
          eyeM: b.eye_m,
          eyeUpperM: b.eye_upper_m,
        })),
      })),
      targetBuilding: r.target_building && {
        id: r.target_building.id,
        heightM: r.target_building.height,
        estimated: r.target_building.height_source === 'estimated',
      },
    }
  }
  return lines
}

/** The building the lines start in, of a `hotel_view_eyes` answer. */
export const ownBuildingOf = (answer: unknown): string | null =>
  linesAnswer.safeParse(answer).data?.own_building ?? null

interface Point {
  lat: number
  lon: number
  /** A ray of the horizon at `RAY_ANGLES`, the coast or a place (the default). */
  kind?: 'horizon' | 'sea'
}

/** The lines from the hotel's point to the points, a call per `LINES_PER_CALL`, and the hotel's own building. */
async function measure(db: Db, hotel: Point, points: readonly Point[]) {
  const batches: Point[][] = []
  for (let i = 0; i < points.length; i += LINES_PER_CALL) batches.push(points.slice(i, i + LINES_PER_CALL))
  const answers = await Promise.all(
    batches.map(async (batch) => {
      const { data, error } = await db.rpc('hotel_view_eyes', {
        lat: hotel.lat,
        lon: hotel.lon,
        targets: batch.map(({ lat, lon, kind }) => ({
          lat,
          lon,
          ...(kind && { kind }),
          ...(kind === 'horizon' && { angles: [...RAY_ANGLES] }),
        })),
      })
      if (error) throw error
      return { lines: linesOf(data, batch.length), own: ownBuildingOf(data) }
    }),
  )
  return { lines: answers.flatMap((a) => a.lines), own: answers.find((a) => a.own)?.own ?? null }
}

/** A ray keeps the 2 buildings of the highest eyes of each angle: the answer of 120 rays stays ~70 KB. */
const RAY_BLOCKERS = 2

const trimmed = (line: SightLine): SightLine => ({
  ...line,
  eyes: line.eyes.map((eye) => ({ ...eye, blockers: eye.blockers.slice(0, RAY_BLOCKERS) })),
})

const nearPlace = z.object({
  category: z.string(),
  osm_type: z.string().optional(),
  osm_id: z.number().optional(),
  name: z.string().nullable(),
  tags: z.record(z.string(), z.string()).optional().catch(undefined),
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
    .map((p) => ({
      name: p.name,
      ...(p.nameEn && { nameEn: p.nameEn }),
      ...(p.aliases && { aliases: p.aliases }),
      kind: p.kind,
      lat: p.lat,
      lon: p.lon,
    }))

type Landmark = ReturnType<typeof ostrovokLandmarks>[number]

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('ru') === b.trim().toLocaleLowerCase('ru')

/**
 * The landmarks of the view: the Ostrovok places and the attractions of OSM, a place of both once with its Ostrovok
 * name (`mergePlaces`); an attraction OSM maps twice (a node and a building) once.
 */
export function viewLandmarks(
  ostrovok: readonly Landmark[],
  osm: readonly z.infer<typeof nearPlace>[],
): Omit<ViewTarget, 'line' | 'distanceM' | 'bearing'>[] {
  const named = osm
    .filter((p) => p.name && osm.findIndex((q) => q.name && sameName(q.name, p.name!)) === osm.indexOf(p))
    .map((p) => ({
      name: p.name,
      category: p.category,
      lat: p.lat,
      lon: p.lon,
      ...(p.tags && { tags: p.tags }),
      ...(p.osm_type && p.osm_id !== undefined && { osmType: p.osm_type, osmId: p.osm_id }),
    }))
  const merged = mergePlaces(ostrovok, named)
  return [
    ...merged.ostrovok.map(({ place }) => ({
      kind: 'ostrovok' as const,
      name: place.name,
      category: place.kind.toLocaleLowerCase('ru'),
      lat: place.lat,
      lon: place.lon,
    })),
    ...merged.osm.map((p) => ({
      kind: 'attraction' as const,
      name: p.name!,
      category: 'достопримечательность',
      lat: p.lat,
      lon: p.lon,
    })),
  ]
}

type Measured = Omit<HotelView, 'window' | 'windowSides'>

const readView = unstable_cache(
  async (_hotelId: string, lat: number, lon: number, ostrovok: Landmark[]): Promise<Measured> => {
    const db = database()
    const hotel = { lat, lon }
    const rayPoints = RAY_BEARINGS.map((bearing) => ({
      ...pointAt(hotel, bearing, RAY_LENGTH_M),
      kind: 'horizon' as const,
    }))
    const [rays, sea, attractions] = await Promise.all([
      measure(db, hotel, rayPoints),
      db.rpc('osm_places_near', { lat, lon, radius_m: SEA_RADIUS_M, wanted: ['sea'], per_category: 20 }),
      db.rpc('osm_places_near', { lat, lon, radius_m: LANDMARK_RADIUS_M, wanted: ['attraction'], per_category: 10 }),
    ])
    const coast = nearOf(sea.error ? null : sea.data, 'sea')
    const seaTargets: Omit<ViewTarget, 'line'>[] = seaPoints(
      hotel,
      coast.places.map((p) => ({ lat: p.near_lat, lon: p.near_lon, distanceM: p.distance_m })),
    ).map((p) => ({ kind: 'sea', name: 'Берег моря', category: 'море', ...p }))
    const osm = nearOf(attractions.error ? null : attractions.data, 'attraction').places
    const landmarks: Omit<ViewTarget, 'line'>[] = viewLandmarks(ostrovok, osm).map((p) => ({
      ...p,
      distanceM: Math.round(haversineMeters(hotel, p)),
      bearing: bearingDeg(hotel, p),
    }))
    const targets = [...seaTargets, ...landmarks]
    const { lines } = await measure(
      db,
      hotel,
      targets.map((t) => ({ lat: t.lat, lon: t.lon, ...(t.kind === 'sea' && { kind: 'sea' as const }) })),
    )
    const measured = targets.map((t, i): ViewTarget => ({ ...t, line: lines[i] }))
    return {
      ownBuilding: rays.own,
      rays: RAY_BEARINGS.flatMap((bearing, i) => {
        const line = rays.lines[i]
        return line ? [{ bearing, line: trimmed(line) }] : []
      }),
      sea: measured.filter((t) => t.kind === 'sea'),
      // Without the coast loaded nothing is known; with it loaded and no point within the radius, there is no sea near.
      seaChecked: !sea.error && (coast.covered || coast.places.length > 0),
      landmarks: measured.filter((t) => t.kind !== 'sea').sort((a, b) => a.distanceM - b.distanceM),
    }
  },
  [CATALOG_TAG, 'hotel-view-v4'],
  { tags: [CATALOG_TAG], revalidate: CATALOG_LIFETIME },
)

const warn = (what: string, error: unknown) =>
  // The kind and the provider's short message only.
  console.warn(`${what} (${String((error as { message?: unknown })?.message ?? error).slice(0, 200)})`)

/**
 * The view from every floor of the real hotel (`windowOf`: EUBUCCO's building, else the floors the rooms take), or
 * `null` when there are neither (`details.building` is null for a building lower than the floors the rooms take) or
 * the lines cannot be read.
 */
export async function loadHotelView(
  hotel: { id: string; lat: number; lon: number },
  building: HotelBuilding | null | undefined,
  roomFloors: number | null | undefined,
  nearby: readonly NearbyPlace[],
): Promise<HotelView | null> {
  const window = windowOf(building, roomFloors)
  if (!isRealHotel(hotel.id) || !window) return null
  try {
    const measured = await readView(hotel.id, hotel.lat, hotel.lon, ostrovokLandmarks(nearby))
    return { window, ...measured, windowSides: [] }
  } catch (error) {
    warn(`hotel view: none for ${hotel.id}`, error)
    return null
  }
}

/** The lines from the hotel to places found by Эвал's geo tools; `null` when they cannot be read. */
export async function checkViewPoints(
  hotel: { id: string; lat: number; lon: number },
  points: readonly { lat: number; lon: number }[],
): Promise<(SightLine | null)[] | null> {
  if (!isRealHotel(hotel.id) || points.length === 0) return null
  try {
    return (await measure(database(), hotel, points)).lines
  } catch (error) {
    warn(`hotel view: no lines for ${hotel.id}`, error)
    return null
  }
}

export { VIEW_MAP_RADIUS_M }

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
