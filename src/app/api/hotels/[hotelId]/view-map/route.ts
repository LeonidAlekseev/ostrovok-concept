import type { NextRequest } from 'next/server'
import { CDN_CACHE_HEADERS, loadVisibleHotel } from '@/lib/api'
import { loadStandaloneMap } from '@/lib/standalone/maps'
import type { ViewMapResponse } from './schema'

/**
 * The buildings of EUBUCCO around a real hotel for the map of «Вид из отеля» (`ViewMap`, GeoJSON with the heights):
 * `{ map: null }` for a synthetic hotel, an unknown one, a hotel not shown in this environment or a failure.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await context.params
  const hotel = await loadVisibleHotel(hotelId)
  // The standalone demo's maps are static files of the snapshot (src/lib/standalone/maps.ts).
  const answer = hotel
    ? ((await loadStandaloneMap(request.nextUrl.origin, hotel.id, 'view-map')) as ViewMapResponse | null)
    : null
  return Response.json(answer ?? ({ map: null } satisfies ViewMapResponse), { headers: CDN_CACHE_HEADERS })
}
