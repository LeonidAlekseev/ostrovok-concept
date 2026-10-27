import type { NextRequest } from 'next/server'
import { CDN_CACHE_HEADERS, loadVisibleHotel } from '@/lib/api'
import { loadHotelDetails } from '@/lib/db/hotelDetails'
import { loadHotelView } from '@/lib/db/view'

/**
 * «Вид из отеля» of a real hotel for every floor at once for the page (`HotelView`): `{ view: null }` for a synthetic
 * hotel, an unknown one, a hotel not shown in this environment, one with neither a building's height nor the floors
 * its rooms take, or a failure — the page says «нет точных данных».
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await context.params
  const hotel = await loadVisibleHotel(hotelId)
  const details = hotel ? await loadHotelDetails(hotel.id) : null
  const view =
    hotel && details ? await loadHotelView(hotel, details.building, details.facts.roomFloors, details.nearby) : null
  return Response.json({ view }, { headers: CDN_CACHE_HEADERS })
}
