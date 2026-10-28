import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/db/database.types'
import { serviceClient } from '@/lib/db/serviceClient'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'
import { PLACE_CATEGORIES } from './categories'
import type { LatLon } from './distance'
import type { CallBudget } from './http'
import type { SharedCounter } from './limits'
import type { GeocodedPlace } from './nominatim'
import type { OsmPlaceRow } from './overpass'
import type { CachedNear, Place, PlaceStore } from './places'
import { ok, timedOut, unavailable, type GeoResult } from './result'
import { saveRows } from './save'

/**
 * The cache of places in Supabase (supabase/migrations/20261026130000_osm_places.sql): reads through
 * `osm_places_near` and `osm_places_named`, writes with the service role. Without the service key the cache is read
 * with the public key and nothing is written; without Supabase every call is `unavailable` and Overpass answers.
 */

/** A read of the cache within the turn. */
export const DB_TIMEOUT_MS = 2000

type Client = SupabaseClient<Database>

let clients: Promise<{ read: Client | null; write: Client | null }> | undefined

async function supabase() {
  clients ??= (async () => {
    if (!isSupabaseConfigured) return { read: null, write: null }
    const write = await serviceClient()
    const options = { auth: { persistSession: false, autoRefreshToken: false } }
    return { read: write ?? createClient<Database>(supabaseUrl, supabaseAnonKey, options), write }
  })()
  const answer = await clients
  // A key that did not come in time leaves no write client for good: the next call asks again.
  if (!answer.write && isSupabaseConfigured) clients = undefined
  return answer
}

const osmType = z.enum(['node', 'way', 'relation'])
const category = z.enum([...PLACE_CATEGORIES, 'other'])
const tags = z.record(z.string(), z.string()).catch({})
const origin = z.enum(['preload', 'online'])

const nearPlace = z.object({
  category,
  osm_type: osmType,
  osm_id: z.number(),
  name: z.string().nullable(),
  categories: z.array(z.string()).transform((list) => list.filter((c) => category.safeParse(c).success)),
  tags,
  lat: z.number(),
  lon: z.number(),
  distance_m: z.number(),
  near_lat: z.number(),
  near_lon: z.number(),
  origin,
  attribution: z.string(),
})

const nearAnswer = z.object({
  covered: z.array(z.string()).transform((list) => list.filter((c) => category.safeParse(c).success)),
  places: z.array(z.unknown()),
})

const namedPlace = nearPlace.pick({
  osm_type: true,
  osm_id: true,
  name: true,
  categories: true,
  tags: true,
  lat: true,
  lon: true,
})

/** A place of `osm_places_near`; one the schema does not take (a category of a newer version) is left out. */
function placeOf(value: unknown): Place[] {
  const parsed = nearPlace.safeParse(value)
  if (!parsed.success) return []
  const p = parsed.data
  return [
    {
      osmType: p.osm_type,
      osmId: p.osm_id,
      name: p.name,
      category: p.category,
      categories: p.categories as Place['categories'],
      tags: p.tags,
      lat: p.lat,
      lon: p.lon,
      distanceM: p.distance_m,
      near: { lat: p.near_lat, lon: p.near_lon },
      origin: p.origin,
      attribution: p.attribution,
    },
  ]
}

/** The signal of a read: the budget's abort and the shorter of its time and `DB_TIMEOUT_MS`. */
function readSignal(budget: CallBudget) {
  const timeout = AbortSignal.timeout(Math.max(1, Math.min(DB_TIMEOUT_MS, budget.deadline - Date.now())))
  return { timeout, signal: budget.signal ? AbortSignal.any([budget.signal, timeout]) : timeout }
}

function readFailure(error: { message: string } | null, timeout: AbortSignal) {
  if (timeout.aborted) return timedOut('database')
  console.warn(`geo: cache read failed (${error?.message.slice(0, 200) ?? 'no answer'})`)
  return unavailable('database')
}

export const supabasePlaceStore: PlaceStore = {
  async near(point, radiusM, categories, perCategory, budget): Promise<GeoResult<CachedNear>> {
    const { read } = await supabase()
    if (!read) return unavailable('database')
    const { timeout, signal } = readSignal(budget)
    const { data, error } = await read
      .rpc('osm_places_near', {
        lat: point.lat,
        lon: point.lon,
        radius_m: radiusM,
        wanted: [...categories],
        per_category: perCategory,
      })
      .abortSignal(signal)
    if (budget.signal?.aborted) throw budget.signal.reason
    const answer = nearAnswer.safeParse(data)
    if (error || !answer.success) return readFailure(error, timeout)
    return ok({
      covered: answer.data.covered as CachedNear['covered'],
      places: answer.data.places.flatMap(placeOf),
    })
  },

  async named(name, budget): Promise<GeoResult<GeocodedPlace[]>> {
    const { read } = await supabase()
    if (!read) return unavailable('database')
    const { timeout, signal } = readSignal(budget)
    const { data, error } = await read.rpc('osm_places_named', { q: name, max_places: 5 }).abortSignal(signal)
    if (budget.signal?.aborted) throw budget.signal.reason
    const answer = z.array(z.unknown()).safeParse(data)
    if (error || !answer.success) return readFailure(error, timeout)
    return ok(
      answer.data.flatMap((value) => {
        const parsed = namedPlace.safeParse(value)
        if (!parsed.success) return []
        const p = parsed.data
        return [
          {
            osmType: p.osm_type,
            osmId: p.osm_id,
            name: p.name,
            displayName: p.name ?? '',
            categories: (p.categories.length ? p.categories : ['other']) as GeocodedPlace['categories'],
            tags: p.tags,
            lat: p.lat,
            lon: p.lon,
          },
        ]
      }),
    )
  },

  async save(rows: readonly OsmPlaceRow[], from) {
    const { write } = await supabase()
    if (!write) return false
    return saveRows(write, rows, from)
  },

  async addArea(point: LatLon, radiusM, categories) {
    const { write } = await supabase()
    if (!write) return false
    const { error } = await write
      .rpc('osm_place_area_add', { lat: point.lat, lon: point.lon, radius_m: radiusM, categories: [...categories] })
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS))
    if (error) console.warn(`geo: osm_place_area_add failed (${error.message.slice(0, 200)})`)
    return !error
  },
}

/** The counter shared by the server's instances (`rate_limit_hit`) for the limits of the OSM services. */
export const sharedOsmCounter: SharedCounter = async (key, limit, windowS) => {
  const { write } = await supabase()
  if (!write) return null
  const { data, error } = await write
    .rpc('rate_limit_hit', { hit_key: key, hit_limit: limit, window_seconds: windowS })
    .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS))
  return error || typeof data !== 'boolean' ? null : data
}
