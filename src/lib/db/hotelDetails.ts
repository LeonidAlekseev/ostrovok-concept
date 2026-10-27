import 'server-only'
import { REAL_HOTEL_ID_PREFIX } from '@/lib/catalog'
import type { HotelDetails } from '@/lib/hotelDetails'
import { otaHotelDetails, pageRowSchema, PAGE_COLUMNS, PLACE_COLUMNS, placeRowSchema } from '@/lib/ota/page'
import { anonClient, catalogCached, readOrNull } from './anon'

/**
 * The details of a real hotel from its Ostrovok page (`ota_hotel_pages`, `ota_hotel_places`, the building of
 * `hotel_features`), read with the anon key and cached with the catalogue, one entry a hotel. A synthetic hotel, a
 * hotel without a page, a database without the tables or a failure read as `null`: the page shows the catalogue's
 * row alone and Эвал says what it does not know.
 */

// v3: the building tells an estimated height apart.
const readDetails = catalogCached(['hotel-details-v3'], async (hotelId: string): Promise<HotelDetails | null> => {
  const masterId = Number(hotelId.slice(REAL_HOTEL_ID_PREFIX.length))
  const db = anonClient()
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
})

/** The details of the hotel's Ostrovok page, or `null` when there are none. */
export const loadHotelDetails = async (hotelId: string): Promise<HotelDetails | null> =>
  readOrNull(hotelId, 'hotel details', () => readDetails(hotelId))
