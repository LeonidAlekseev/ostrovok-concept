import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import type { Hotel } from '../catalog'
import { featuredFirst, parseRoute, routeCard, type Route, type RouteCardData } from '../routes'
import { loadHotels } from './catalog'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '../supabase/config'

/** The cache tag of the routes: revalidate it after the table changes. */
export const ROUTES_TAG = 'routes'

/** The routes' table, read with the anon key under RLS, no cookies. */
function routesTable() {
  if (!isSupabaseConfigured) throw new Error('нет NEXT_PUBLIC_SUPABASE_URL: npm run secrets:reveal')
  return createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } }).from('routes')
}

/** The `data` of a route's row, or `null` for an unknown id. */
const loadRouteData = unstable_cache(
  async (id: string): Promise<unknown> => {
    const { data, error } = await routesTable().select('data').eq('id', id).maybeSingle()
    if (error) throw new Error(`routes: ${error.message}`)
    return data?.data ?? null
  },
  ['route-data'],
  { tags: [ROUTES_TAG] },
)

export interface LoadedRoute {
  route: Route
  /** The hotels of the stops by id. */
  hotels: Record<string, Hotel>
}

/** The route and its hotels, or `null` for an unknown id; a malformed route or an unknown hotel throws. */
export async function loadRoute(id: string): Promise<LoadedRoute | null> {
  const data = await loadRouteData(id)
  if (data === null) return null
  // The shape first, then the stops' hotels, which must all be in the catalog.
  const { stops } = parseRoute(data, () => true)
  const hotels = Object.fromEntries((await loadHotels(stops.map((stop) => stop.hotelId))).map((h) => [h.id, h]))
  const route = parseRoute(data, (hotelId) => hotelId in hotels)
  return { route, hotels }
}

/** Every route's row, by id. */
const loadRouteRows = unstable_cache(
  async (): Promise<{ featured: boolean; data: unknown }[]> => {
    const { data, error } = await routesTable().select('featured, data').order('id')
    if (error) throw new Error(`routes: ${error.message}`)
    return data ?? []
  },
  ['route-rows'],
  { tags: [ROUTES_TAG] },
)

/**
 * The cards of all routes, the featured first, with the estimate of the route page: the browser gets these,
 * not the routes. A malformed route or one with a hotel out of the catalog is left out with a warning.
 */
export async function loadRouteCards(): Promise<RouteCardData[]> {
  const parsed = (await loadRouteRows()).flatMap(({ featured, data }) => {
    try {
      return [{ route: parseRoute(data, () => true), featured }]
    } catch (error) {
      console.warn(`routes: ${error instanceof Error ? error.message : error}`)
      return []
    }
  })
  const ids = parsed.flatMap(({ route }) => route.stops.map((stop) => stop.hotelId))
  const hotels = Object.fromEntries((await loadHotels(ids)).map((h) => [h.id, h]))
  return featuredFirst(
    parsed.flatMap(({ route, featured }) => {
      const missing = route.stops.find((stop) => !(stop.hotelId in hotels))
      if (!missing) return [routeCard(route, hotels, featured)]
      console.warn(`routes: ${route.id}: отеля ${missing.hotelId} нет в каталоге`)
      return []
    }),
  )
}
