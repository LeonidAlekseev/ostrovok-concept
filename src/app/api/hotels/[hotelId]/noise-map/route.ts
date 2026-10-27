import type { NextRequest } from 'next/server'
import { CDN_CACHE_HEADERS, loadVisibleHotel } from '@/lib/api'
import { loadNoiseMap } from '@/lib/db/noise'
import type { NoiseMapResponse } from './schema'

/**
 * The EEA noise contours around a real hotel for the map of «Шум и окружение» (`NoiseMap`, GeoJSON): `{ map: null }`
 * for a synthetic hotel, an unknown one, a hotel not shown in this environment or a failure.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await context.params
  const hotel = await loadVisibleHotel(hotelId)
  const map = hotel ? await loadNoiseMap(hotel) : null
  return Response.json({ map } satisfies NoiseMapResponse, { headers: CDN_CACHE_HEADERS })
}
