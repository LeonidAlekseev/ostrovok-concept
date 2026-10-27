import 'server-only'
import { featuresOf, withSeaDistances, withoutDoubtfulBuildings, type HotelFeatures } from '@/lib/features'
import { ROOM_FLOORS_COLUMNS, roomFloorsOf } from '@/lib/ota/page'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { anonClient, catalogCached, warnShort } from './anon'

/**
 * The hotels' features (`hotel_features`, `hotel_room_views_named`, see `npm run db:features`) and their distances to
 * the sea (`hotel_sea_distances`), read with the anon key and cached with the catalogue. Small: only the hotels with
 * data have rows. A failure or a database without the tables reads as no data, so Эвал says «нет данных» instead of
 * failing the answer.
 */

const PAGE = 1000

async function readAll<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < PAGE) return rows
  }
}

const readFeatures = catalogCached(['features'], async (): Promise<[string, HotelFeatures][]> => {
  const db = anonClient()
  const [hotels, views, pages, sea] = await Promise.all([
    readAll((from, to) =>
      db
        .from('hotel_features')
        .select('hotel_id, floors, height_m, lden_min, lden_max, lnight_min, lnight_max')
        .order('hotel_id')
        .range(from, to),
    ),
    readAll((from, to) =>
      db
        .from('hotel_room_views_named')
        .select('hotel_id, view, room_name')
        .order('hotel_id')
        .order('rg_hash')
        .order('view')
        .range(from, to),
    ),
    // The floors the rooms take: a building lower than them is not the hotel's. None before the pages' migration.
    readAll((from, to) =>
      db.from('ota_hotel_pages').select(ROOM_FLOORS_COLUMNS).order('master_id').range(from, to),
    ).catch(() => []),
    // The distances to the coastline; none before the function's migration, and «нет данных» then.
    readAll((from, to) => db.rpc('hotel_sea_distances').range(from, to)).catch(() => []),
  ])
  // A cached value is JSON: the map goes as its entries.
  return [...withSeaDistances(withoutDoubtfulBuildings(featuresOf(hotels, views), roomFloorsOf(pages)), sea)]
})

/** The features of the hotels that have data; the rest are missing from the map. */
export async function loadHotelFeatures(): Promise<Map<string, HotelFeatures>> {
  if (!isSupabaseConfigured) return new Map()
  try {
    return new Map(await readFeatures())
  } catch (error) {
    warnShort('features: no data', error)
    return new Map()
  }
}
