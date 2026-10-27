import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { REAL_HOTEL_ID_PREFIX } from '@/lib/catalog'
import type { Database } from '@/lib/db/database.types'
import type { HotelDetails } from '@/lib/hotelDetails'
import { otaHotelDetails, pageRowSchema, PAGE_COLUMNS, PLACE_COLUMNS, placeRowSchema } from '@/lib/ota/page'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'
import { CATALOG_LIFETIME, CATALOG_TAG } from './catalog'

/**
 * The details of a real hotel from its Ostrovok page (`ota_hotel_pages`, `ota_hotel_places`, the building of
 * `hotel_features`), read with the anon key and cached with the catalogue, one entry a hotel. A synthetic hotel, a
 * hotel without a page, a database without the tables or a failure read as `null`: the page shows the catalogue's
 * row alone and Эвал says what it does not know.
 */

const database = () =>
  createClient<Database>(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })

const readDetails = unstable_cache(
  async (hotelId: string): Promise<HotelDetails | null> => {
    const masterId = Number(hotelId.slice(REAL_HOTEL_ID_PREFIX.length))
    const db = database()
    const [page, places, building] = await Promise.all([
      db.from('ota_hotel_pages').select(PAGE_COLUMNS).eq('master_id', masterId).maybeSingle(),
      db.from('ota_hotel_places').select(PLACE_COLUMNS).eq('hotel_id', hotelId),
      db
        .from('hotel_features')
        .select('floors, height_m, floors_source, height_source')
        .eq('hotel_id', hotelId)
        .maybeSingle(),
    ])
    for (const { error } of [page, places, building]) if (error) throw error
    if (!page.data) return null
    return otaHotelDetails(
      pageRowSchema.parse(page.data),
      (places.data ?? []).map((row) => placeRowSchema.parse(row)),
      building.data,
    )
  },
  // v2: the building tells an estimated height apart.
  [CATALOG_TAG, 'hotel-details-v3'],
  { tags: [CATALOG_TAG], revalidate: CATALOG_LIFETIME },
)

/** The details of the hotel's Ostrovok page, or `null` when there are none. */
export async function loadHotelDetails(hotelId: string): Promise<HotelDetails | null> {
  if (!isSupabaseConfigured || !/^ota-\d{1,15}$/.test(hotelId)) return null
  try {
    return await readDetails(hotelId)
  } catch (error) {
    // The kind and the provider's short message only.
    console.warn(
      `hotel details: none for ${hotelId} (${String((error as { message?: unknown })?.message ?? error).slice(0, 200)})`,
    )
    return null
  }
}
