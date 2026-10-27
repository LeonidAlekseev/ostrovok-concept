import type { NextRequest } from 'next/server'
import { CDN_CACHE_HEADERS, loadVisibleHotel } from '@/lib/api'
import { loadViewMap } from '@/lib/db/view'

/**
 * The buildings of EUBUCCO around a real hotel for the map of «Вид из отеля» (`ViewMap`, GeoJSON with the heights):
 * `{ map: null }` for a synthetic hotel, an unknown one, a hotel not shown in this environment or a failure.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await context.params
  const hotel = await loadVisibleHotel(hotelId)
  const map = hotel ? await loadViewMap(hotel) : null
  return Response.json({ map }, { headers: CDN_CACHE_HEADERS })
}
