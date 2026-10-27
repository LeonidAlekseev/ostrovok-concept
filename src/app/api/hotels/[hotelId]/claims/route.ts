import type { NextRequest } from 'next/server'
import { apiError, CDN_CACHE_HEADERS, loadVisibleHotel } from '@/lib/api'
import { loadHotelClaims } from '@/lib/db/claims'
import { isRealHotelId } from '@/lib/db/anon'
import { CLAIMS_QUERY_ERROR, NOT_FOUND_ERROR, STORE_ERROR, claimsQuerySchema, type ClaimsResponse } from './schema'

/**
 * The claims of a real hotel by a prefix of the property, each with its value, status, confidence, sources and
 * calculation (the store of claims, `loadHotelClaims`): 400 for a bad query, 404 for a hotel that is unknown, hidden
 * in this environment or synthetic, 503 when the store cannot be read.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await context.params
  const params = request.nextUrl.searchParams
  const query = claimsQuerySchema.safeParse({
    property: params.get('property') ?? undefined,
    limit: params.get('limit') ?? undefined,
  })
  if (!query.success) return apiError(400, CLAIMS_QUERY_ERROR)
  const hotel = await loadVisibleHotel(hotelId)
  if (!hotel || !isRealHotelId(hotel.id)) return apiError(404, NOT_FOUND_ERROR)

  const { property, limit } = query.data
  const claims = await loadHotelClaims(hotel.id, property)
  if (!claims) return apiError(503, STORE_ERROR)
  return Response.json(
    {
      hotelId: hotel.id,
      property,
      claims: claims.slice(0, limit),
      truncated: claims.length > limit,
    } satisfies ClaimsResponse,
    { headers: CDN_CACHE_HEADERS },
  )
}
