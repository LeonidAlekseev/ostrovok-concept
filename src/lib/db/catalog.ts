import 'server-only'
import { createClient, type PostgrestError } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import type { Destination } from '@/data/destinations'
import type { Hotel, HotelSummary } from '@/lib/catalog'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'

/**
 * The one way into the catalogue: pages, route handlers and server actions read destinations and hotels
 * here and hand them to the calculations and to the client components as props. The catalogue lives in
 * Supabase (read with the anon key under RLS) and is cached by Next under the `catalog` tag: for an hour,
 * or until `POST /api/revalidate` after `npm run db:seed`.
 */

export const CATALOG_TAG = 'catalog'
/** Seconds a cached read lives before the next request refreshes it. */
export const CATALOG_LIFETIME = 3600

/** The catalogue could not be read: no settings at build time or the database failed. */
export class CatalogUnavailableError extends Error {
  constructor(detail: string) {
    super(`Каталог недоступен: ${detail}`)
    this.name = 'CatalogUnavailableError'
  }
}

function database() {
  if (!isSupabaseConfigured)
    throw new CatalogUnavailableError(
      'нет NEXT_PUBLIC_SUPABASE_URL или NEXT_PUBLIC_SUPABASE_ANON_KEY: npm run secrets:reveal',
    )
  return createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

function rowsOf<T>({ data, error }: { data: T[] | null; error: PostgrestError | null }): T[] {
  if (error) throw new CatalogUnavailableError(error.message)
  return data ?? []
}

const cached = <Args extends unknown[], Result>(name: string, read: (...args: Args) => Promise<Result>) =>
  unstable_cache(read, [CATALOG_TAG, name], { tags: [CATALOG_TAG], revalidate: CATALOG_LIFETIME })

/** The summary columns of a hotel; the full hotel is its `data`. */
const SUMMARY =
  'id, destinationId:destination_id, name:data->>name, stayType:stay_type, stars, rating, reviewCount:data->reviewCount, priceFrom:price_from, wifiMbps:wifi_mbps, workspace, isNew:data->isNew'

/** All destinations, in the catalogue's order. */
export const loadDestinations: () => Promise<Destination[]> = cached('destinations', async () =>
  rowsOf(
    await database()
      .from('destinations')
      .select('data')
      .order('position', { nullsFirst: false })
      .order('id')
      .returns<{ data: Destination }[]>(),
  ).map((row) => row.data),
)

export const loadDestination = async (id: string): Promise<Destination | undefined> =>
  (await loadDestinations()).find((d) => d.id === id)

/** Summaries of all hotels, grouped by city in the order of the destinations. */
export const loadHotelSummaries: () => Promise<HotelSummary[]> = cached('summaries', async () =>
  rowsOf(
    await database()
      .from('hotels')
      .select(SUMMARY)
      .order('position', { nullsFirst: false })
      .order('id')
      .returns<HotelSummary[]>(),
  ),
)

/** The hand-picked "recently added" hotels, in the catalogue's order. */
export const loadNewHotels = async (): Promise<HotelSummary[]> => (await loadHotelSummaries()).filter((h) => h.isNew)

const readHotel = cached('hotel', async (id: string): Promise<Hotel | null> => {
  const rows = rowsOf(await database().from('hotels').select('data').eq('id', id).returns<{ data: Hotel }[]>())
  return rows[0]?.data ?? null
})

/** The full hotel, or `undefined` for an unknown id. */
export const loadHotel = async (id: string): Promise<Hotel | undefined> => (await readHotel(id)) ?? undefined

const readHotels = cached('hotels', async (ids: string[]): Promise<Hotel[]> =>
  rowsOf(await database().from('hotels').select('data').in('id', ids).returns<{ data: Hotel }[]>()).map(
    (row) => row.data,
  ),
)

/** Full hotels by id, in the order of the ids; unknown ids are skipped. */
export async function loadHotels(ids: readonly string[]): Promise<Hotel[]> {
  const unique = [...new Set(ids)].sort()
  if (unique.length === 0) return []
  const byId = new Map((await readHotels(unique)).map((h) => [h.id, h]))
  return ids.flatMap((id) => byId.get(id) ?? [])
}

/** Full hotels of one city in the catalogue's order: one cache entry a city keeps each entry small. */
const readCityHotels = cached('city', async (destinationId: string): Promise<Hotel[]> =>
  rowsOf(
    await database()
      .from('hotels')
      .select('data')
      .eq('destination_id', destinationId)
      .order('position', { nullsFirst: false })
      .order('id')
      .returns<{ data: Hotel }[]>(),
  ).map((row) => row.data),
)

/** Full hotels of the cities, city by city in the given order. */
export const loadCityHotels = async (destinationIds: readonly string[]): Promise<Hotel[]> =>
  (await Promise.all(destinationIds.map((id) => readCityHotels(id)))).flat()

/** Every full hotel of the catalogue, in the order of `loadHotelSummaries`. */
export const loadAllHotels = async (): Promise<Hotel[]> => loadCityHotels((await loadDestinations()).map((d) => d.id))
