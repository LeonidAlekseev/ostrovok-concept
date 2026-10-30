import type { NextRequest } from 'next/server'
import { CDN_CACHE_HEADERS, loadVisibleHotel } from '@/lib/api'
import { loadStandaloneMap } from '@/lib/standalone/maps'
import type { NoiseMapResponse } from './schema'

/**
 * The EEA noise contours around a real hotel for the map of «Шум и окружение» (`NoiseMap`, GeoJSON): `{ map: null }`
 * for a synthetic hotel, an unknown one, a hotel not shown in this environment or a failure.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await context.params
  const hotel = await loadVisibleHotel(hotelId)
  // The standalone demo's maps are static files of the snapshot (src/lib/standalone/maps.ts).
  const answer = hotel ? ((await loadStandaloneMap(request.nextUrl.origin, hotel.id, 'noise-map')) as NoiseMapResponse | null) : null
  return Response.json(answer ?? ({ map: null } satisfies NoiseMapResponse), { headers: CDN_CACHE_HEADERS })
}
