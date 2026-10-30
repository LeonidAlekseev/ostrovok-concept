import type { NextRequest } from 'next/server'
import { apiError, CDN_CACHE_HEADERS, loadVisibleHotel } from '@/lib/api'
import { isRealHotelId } from '@/lib/db/anon'
import { loadHotelRelations } from '@/lib/db/knowledge'
import {
  NOT_FOUND_ERROR,
  RELATIONS_QUERY_ERROR,
  STORE_ERROR,
  relationsQuerySchema,
  type RelationsResponse,
} from './schema'
import { withStandaloneDb } from '@/lib/standalone/server'

/**
 * The edges of a real hotel in the graph of the store — the places near it, its building — the nearest first, with the
 * distance claim and the source of each: 400 for a bad query, 404 for a hotel that is unknown, hidden in this
 * environment or synthetic, 503 when the store cannot be read.
 */
async function handleGET(request: NextRequest, context: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await context.params
  const params = request.nextUrl.searchParams
  const query = relationsQuerySchema.safeParse({
    predicate: params.get('predicate') ?? undefined,
    category: params.get('category') ?? undefined,
    limit: params.get('limit') ?? undefined,
  })
  if (!query.success) return apiError(400, RELATIONS_QUERY_ERROR)
  const hotel = await loadVisibleHotel(hotelId)
  if (!hotel || !isRealHotelId(hotel.id)) return apiError(404, NOT_FOUND_ERROR)

  const { predicate, category, limit } = query.data
  const relations = await loadHotelRelations(hotel, { predicate, category })
  if (!relations) return apiError(503, STORE_ERROR)
  return Response.json(
    {
      hotelId: hotel.id,
      relations: relations.slice(0, limit),
      truncated: relations.length > limit,
    } satisfies RelationsResponse,
    { headers: CDN_CACHE_HEADERS },
  )
}

export const GET = withStandaloneDb(handleGET)
