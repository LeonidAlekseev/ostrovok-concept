import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import type { Hotel } from '../catalog'
import { parseRoute, type Route } from '../routes'
import { loadHotels } from './catalog'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '../supabase/config'

/** The cache tag of the routes: revalidate it after the table changes. */
export const ROUTES_TAG = 'routes'

/** The `data` of a route's row, or `null` for an unknown id; read with the anon key under RLS, no cookies. */
const loadRouteData = unstable_cache(
  async (id: string): Promise<unknown> => {
    if (!isSupabaseConfigured) throw new Error('нет NEXT_PUBLIC_SUPABASE_URL: npm run secrets:reveal')
    const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
    const { data, error } = await supabase.from('routes').select('data').eq('id', id).maybeSingle()
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
