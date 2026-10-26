import type { NextRequest } from 'next/server'
import { isVisibleHotel } from '@/lib/catalog'
import { loadHotelDetails } from '@/lib/db/hotelDetails'

/**
 * What the real hotel's Ostrovok page adds to its row (`HotelDetails`), for the hotel dialog of the search, which
 * knows the hotel from `GET /api/hotels`: `{ details: null }` for a synthetic hotel, a hotel without a page or a
 * hotel not shown in this environment.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await context.params
  const details = isVisibleHotel({ id: hotelId }) ? await loadHotelDetails(hotelId) : null
  return Response.json(
    { details },
    // A short CDN life: the server cache, unlike the CDN, is dropped by POST /api/revalidate.
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } },
  )
}
