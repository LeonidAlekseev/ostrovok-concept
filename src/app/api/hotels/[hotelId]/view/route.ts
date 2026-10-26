import type { NextRequest } from 'next/server'
import { isVisibleHotel } from '@/lib/catalog'
import { loadHotel } from '@/lib/db/catalog'
import { loadHotelDetails } from '@/lib/db/hotelDetails'
import { loadHotelView } from '@/lib/db/view'

/**
 * «Вид из отеля» of a real hotel from a floor of its building (`?floor=3`, the top one by default) for the page
 * (`HotelView`): `{ view: null }` for a synthetic hotel, an unknown one, a hotel not shown in this environment, a
 * building without a reliable height or a failure — the page says «недостаточно данных».
 */
export async function GET(request: NextRequest, context: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await context.params
  const floor = Number(request.nextUrl.searchParams.get('floor'))
  const hotel = isVisibleHotel({ id: hotelId }) ? await loadHotel(hotelId) : null
  const details = hotel ? await loadHotelDetails(hotel.id) : null
  const view =
    hotel && details
      ? await loadHotelView(
          hotel,
          details.building,
          details.nearby,
          Number.isInteger(floor) && floor > 0 ? floor : null,
        )
      : null
  return Response.json(
    { view },
    // A short CDN life: the server cache, unlike the CDN, is dropped by POST /api/revalidate.
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } },
  )
}
