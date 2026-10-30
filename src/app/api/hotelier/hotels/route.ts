import { apiError, CDN_CACHE_HEADERS } from '@/lib/api'
import { loadHotelierHotels } from '@/lib/db/claims'
import { HOTELS_STORE_ERROR, type HotelierHotelsResponse } from './schema'
import { withStandaloneDb } from '@/lib/standalone/server'

/**
 * The hotels whose hotelier told their characteristics, with how many and whether they are demonstration: the search
 * results mark them «Сведения отельера». Public, as the claims are; 503 when the store fails.
 */
async function handleGET() {
  const hotels = await loadHotelierHotels()
  if (!hotels) return apiError(503, HOTELS_STORE_ERROR)
  return Response.json({ hotels } satisfies HotelierHotelsResponse, { headers: CDN_CACHE_HEADERS })
}

export const GET = withStandaloneDb(handleGET)
