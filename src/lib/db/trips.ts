import 'server-only'
import type { Hotel } from '../catalog'
import { createClient } from '../supabase/server'
import { parseEdits, parseTrip, type TripData } from '../trip'
import { loadHotels } from './catalog'

/**
 * The user's trip plans in Supabase. Every read and write goes with the session of the request under RLS:
 * a plan is the owner's only, someone else's plan reads as missing. Never the service key.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isTripId = (id: string) => UUID.test(id)

/** The database or its settings failed; the message is for the logs, not the page. */
export class TripsUnavailableError extends Error {
  constructor(detail: string) {
    super(`Планы недоступны: ${detail}`)
    this.name = 'TripsUnavailableError'
  }
}

/** The client and the signed-in user of the request, or `null` for a guest (or without the Supabase settings). */
export async function signedIn() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user ? { supabase, user: data.user } : null
}

/** A new plan of the signed-in user; its id. */
export async function createTrip(routeId: string, data: TripData): Promise<string | null> {
  const session = await signedIn()
  if (!session) return null
  const { data: row, error } = await session.supabase
    .from('trips')
    .insert({ user_id: session.user.id, route_id: routeId, data })
    .select('id')
    .single()
  if (error) throw new TripsUnavailableError(error.message)
  return row.id as string
}

export interface LoadedTrip {
  id: string
  trip: TripData
  /** The hotels of the stops by id. */
  hotels: Record<string, Hotel>
  updatedAt: string
}

/** The hotels of the stops by id; throws when one left the catalogue. */
async function stopHotels(trips: readonly TripData[]): Promise<Record<string, Hotel>> {
  const ids = trips.flatMap((trip) => trip.stops.map((stop) => stop.hotelId))
  const hotels = Object.fromEntries((await loadHotels(ids)).map((hotel) => [hotel.id, hotel]))
  const missing = ids.find((id) => !(id in hotels))
  if (missing) throw new TripsUnavailableError(`отеля ${missing} нет в каталоге`)
  return hotels
}

/** The user's plan and its hotels, or `null` for a guest, an unknown id or someone else's plan. */
export async function loadTrip(id: string): Promise<LoadedTrip | null> {
  if (!isTripId(id)) return null
  const session = await signedIn()
  if (!session) return null
  const { data: row, error } = await session.supabase
    .from('trips')
    .select('id, data, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new TripsUnavailableError(error.message)
  if (!row) return null
  const trip = parseTrip(row.data)
  return { id: row.id, trip, hotels: await stopHotels([trip]), updatedAt: row.updated_at }
}

/**
 * Saves the edits of the user's plan over its stored route: the route itself never comes from the browser.
 * The stops' hotels must be of the route's city. `false` when the plan is not the user's (or is gone).
 */
export async function saveTrip(id: string, edits: unknown): Promise<boolean> {
  if (!isTripId(id)) return false
  const session = await signedIn()
  if (!session) return false
  const { data: row, error } = await session.supabase.from('trips').select('data').eq('id', id).maybeSingle()
  if (error) throw new TripsUnavailableError(error.message)
  if (!row) return false
  const { route } = parseTrip(row.data)
  const next: TripData = { route, ...parseEdits(edits, route) }
  const hotels = await stopHotels([next])
  if (next.stops.some((stop) => hotels[stop.hotelId].destinationId !== route.destinationId))
    throw new Error('План не прошёл проверку: отель другого города')
  const { data: updated, error: updateError } = await session.supabase
    .from('trips')
    .update({ data: next })
    .eq('id', id)
    .select('id')
  if (updateError) throw new TripsUnavailableError(updateError.message)
  return updated.length === 1
}

/** Deletes the user's plan; `false` when it is not the user's (or is gone). */
export async function deleteTrip(id: string): Promise<boolean> {
  if (!isTripId(id)) return false
  const session = await signedIn()
  if (!session) return false
  const { data, error } = await session.supabase.from('trips').delete().eq('id', id).select('id')
  if (error) throw new TripsUnavailableError(error.message)
  return data.length === 1
}

/** The user's plans, the last edited first, with the hotels of their stops; empty for a guest. */
export async function listTrips(): Promise<{ trips: Omit<LoadedTrip, 'hotels'>[]; hotels: Record<string, Hotel> }> {
  const session = await signedIn()
  if (!session) return { trips: [], hotels: {} }
  const { data, error } = await session.supabase
    .from('trips')
    .select('id, data, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw new TripsUnavailableError(error.message)
  // A plan that no longer reads (a malformed row, a hotel gone from the catalogue) is left out rather than
  // hiding all the others.
  const trips = data.flatMap((row) => {
    try {
      return [{ id: row.id as string, trip: parseTrip(row.data), updatedAt: row.updated_at as string }]
    } catch {
      return []
    }
  })
  const ids = trips.flatMap(({ trip }) => trip.stops.map((stop) => stop.hotelId))
  const hotels = Object.fromEntries((await loadHotels(ids)).map((hotel) => [hotel.id, hotel]))
  return { trips: trips.filter(({ trip }) => trip.stops.every((stop) => stop.hotelId in hotels)), hotels }
}
