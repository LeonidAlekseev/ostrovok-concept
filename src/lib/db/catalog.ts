import 'server-only'
import { createClient, type PostgrestError } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import type { Destination } from '@/data/destinations'
import type { Database } from '@/lib/db/database.types'
import { isVisibleHotel, type Hotel, type HotelSummary, type Photo, type SpotlightHotel } from '@/lib/catalog'
import type { MapBox } from '@/lib/mapBox'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'

/**
 * The one way into the catalogue: pages, route handlers and server actions read destinations and hotels
 * here and hand them to the calculations and to the client components as props. The catalogue lives in
 * Supabase (read with the anon key under RLS) and is cached by Next under the `catalog` tag: for an hour,
 * or until `POST /api/revalidate` after `npm run db:seed`. Every loader gives only the hotels shown in this
 * environment (`isVisibleHotel`: production hides the synthetic ones), never the real hotels outside the loaded noise
 * maps (`hotels_outside_noise`), and only the destinations with such hotels; the cache keeps the whole catalogue, so
 * a build of another environment reads the same entries.
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
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function rowsOf<T>({ data, error }: { data: T[] | null; error: PostgrestError | null }): T[] {
  if (error) throw new CatalogUnavailableError(error.message)
  return data ?? []
}

const cached = <Args extends unknown[], Result>(name: string, read: (...args: Args) => Promise<Result>) =>
  unstable_cache(read, [CATALOG_TAG, name], { tags: [CATALOG_TAG], revalidate: CATALOG_LIFETIME })

/**
 * The summary columns of a hotel; the full hotel is its `data`. The stars come from `data` too: the column allows
 * only 1…5 and keeps 1 for a real hotel without stars (0 in `data`).
 */
const SUMMARY =
  'id, destinationId:destination_id, name:data->>name, stayType:stay_type, stars:data->stars, rating, reviewCount:data->reviewCount, priceFrom:price_from, wifiMbps:wifi_mbps, workspace, isNew:data->isNew'

const readDestinations = cached('destinations', async (): Promise<Destination[]> =>
  rowsOf(
    await database()
      .from('destinations')
      .select('data')
      .order('position', { nullsFirst: false })
      .order('id')
      .overrideTypes<{ data: Destination }[], { merge: false }>(),
  ).map((row) => row.data),
)

/** The destinations with a hotel shown, in the catalogue's order. */
export async function loadDestinations(): Promise<Destination[]> {
  const [destinations, hotels] = await Promise.all([readDestinations(), loadHotelSummaries()])
  const shown = new Set(hotels.map((h) => h.destinationId))
  return destinations.filter((d) => shown.has(d.id))
}

export const loadDestination = async (id: string): Promise<Destination | undefined> =>
  (await loadDestinations()).find((d) => d.id === id)

const readHotelSummaries = cached('summaries', async (): Promise<HotelSummary[]> =>
  rowsOf(
    await database()
      .from('hotels')
      .select(SUMMARY)
      .order('position', { nullsFirst: false })
      .order('id')
      .overrideTypes<HotelSummary[], { merge: false }>(),
  ),
)

const readOutsideNoise = cached('outside-noise', async (): Promise<string[]> =>
  rowsOf(await database().rpc('hotels_outside_noise')),
)

/**
 * The real hotels outside the loaded EEA noise maps (`hotels_outside_noise`: the page would say «Нет данных EEA»),
 * hidden everywhere while their rows stay. A failed read hides none: the catalogue does not fail with it.
 */
export async function loadHiddenHotelIds(): Promise<ReadonlySet<string>> {
  try {
    return new Set(await readOutsideNoise())
  } catch (error) {
    console.warn(`catalog: no hotels outside the noise maps (${String((error as Error)?.message).slice(0, 200)})`)
    return new Set()
  }
}

/** The test of the hotels shown: `isVisibleHotel` and not outside the noise maps. */
async function shownTest(): Promise<(hotel: Pick<HotelSummary, 'id'>) => boolean> {
  const hidden = await loadHiddenHotelIds()
  return (hotel) => isVisibleHotel(hotel) && !hidden.has(hotel.id)
}

/** Summaries of the hotels shown, grouped by city in the order of the destinations. */
export async function loadHotelSummaries(): Promise<HotelSummary[]> {
  const [hotels, shown] = await Promise.all([readHotelSummaries(), shownTest()])
  return hotels.filter(shown)
}

/** Hotels the hero globe spotlights in a city without hand-picked ones: as many as the generator picks. */
const SPOTLIGHT_PER_CITY = 3

/**
 * The hotels the hero globe spotlights, in the catalogue's order: the hand-picked "recently added" ones, and the
 * first hotels of a city with none of them, so every city shown has its pin (the real hotels are never picked).
 */
export async function loadNewHotels(): Promise<SpotlightHotel[]> {
  const hotels = await loadHotelSummaries()
  const picked = new Set(hotels.filter((h) => h.isNew).map((h) => h.destinationId))
  const taken = new Map<string, number>()
  const spotlit = hotels.filter((h) => {
    if (picked.has(h.destinationId)) return h.isNew
    const count = taken.get(h.destinationId) ?? 0
    taken.set(h.destinationId, count + 1)
    return count < SPOTLIGHT_PER_CITY
  })
  if (spotlit.length === 0) return []
  const photos = new Map((await readFirstPhotos(spotlit.map((h) => h.id).sort())).map((row) => [row.id, row.photo]))
  return spotlit.map((h) => ({ ...h, photo: photos.get(h.id) ?? null }))
}

/** The first photo of each hotel by id: only that, not the whole hotel. */
const readFirstPhotos = cached('first-photos', async (ids: string[]) =>
  rowsOf(
    await database()
      .from('hotels')
      .select('id, photo:data->photos->0')
      .in('id', ids)
      .overrideTypes<{ id: string; photo: Photo | null }[], { merge: false }>(),
  ),
)

const readHotel = cached('hotel', async (id: string): Promise<Hotel | null> => {
  const rows = rowsOf(
    await database().from('hotels').select('data').eq('id', id).overrideTypes<{ data: Hotel }[], { merge: false }>(),
  )
  return rows[0]?.data ?? null
})

/** The full hotel, or `undefined` for an unknown id or a hotel not shown. */
export async function loadHotel(id: string): Promise<Hotel | undefined> {
  if (!isVisibleHotel({ id }) || (await loadHiddenHotelIds()).has(id)) return undefined
  return (await readHotel(id)) ?? undefined
}

const readHotels = cached('hotels', async (ids: string[]): Promise<Hotel[]> =>
  rowsOf(
    await database().from('hotels').select('data').in('id', ids).overrideTypes<{ data: Hotel }[], { merge: false }>(),
  ).map((row) => row.data),
)

/** Full hotels by id, in the order of the ids; unknown ids and the hotels not shown are skipped. */
export async function loadHotels(ids: readonly string[]): Promise<Hotel[]> {
  const visible = [...new Set(ids)].filter((id) => isVisibleHotel({ id }))
  if (visible.length === 0) return []
  const hidden = await loadHiddenHotelIds()
  const unique = visible.filter((id) => !hidden.has(id)).sort()
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
      .overrideTypes<{ data: Hotel }[], { merge: false }>(),
  ).map((row) => row.data),
)

/** Full hotels shown of the cities, city by city in the given order. */
export async function loadCityHotels(destinationIds: readonly string[]): Promise<Hotel[]> {
  const [cities, shown] = await Promise.all([Promise.all(destinationIds.map((id) => readCityHotels(id))), shownTest()])
  return cities.flat().filter(shown)
}

/** The most hotels of a box: a box is a few blocks of a city, the margin round the view of the map included. */
export const BOX_HOTELS = 200

/** Full hotels in a box of the map in the catalogue's order, at most `BOX_HOTELS`: one cache entry a box. */
const readBoxHotels = cached(
  'box',
  async (west: number, south: number, east: number, north: number): Promise<Hotel[]> =>
    rowsOf(
      await database()
        .from('hotels')
        .select('data')
        .gte('lon', west)
        .lte('lon', east)
        .gte('lat', south)
        .lte('lat', north)
        .order('position', { nullsFirst: false })
        .order('id')
        .limit(BOX_HOTELS)
        .overrideTypes<{ data: Hotel }[], { merge: false }>(),
    ).map((row) => row.data),
)

/** Full hotels shown in a box of the map (`MapBox`), for the map around one hotel. */
export async function loadBoxHotels(box: MapBox): Promise<Hotel[]> {
  const [hotels, shown] = await Promise.all([readBoxHotels(...box), shownTest()])
  return hotels.filter(shown)
}

/** Every full hotel shown, in the order of `loadHotelSummaries`. */
export const loadAllHotels = async (): Promise<Hotel[]> => loadCityHotels((await loadDestinations()).map((d) => d.id))
