import type { NextRequest } from 'next/server'
import { apiError, CDN_CACHE_HEADERS, loadVisibleHotel } from '@/lib/api'
import { isRealHotelId } from '@/lib/db/anon'
import { loadEvidence, searchHotelChunks } from '@/lib/db/claims'
import { NOT_FOUND_ERROR, SEARCH_QUERY_ERROR, STORE_ERROR, searchQuerySchema, type SearchResponse } from './schema'

/**
 * The chunks of the reviews of a real hotel that match `?q=` (`hotel_chunks_search`), each with the evidence it
 * cites. The query goes to the search as it is. The reviews are guests' untrusted text, passed on as data: 400 for a
 * bad query, 404 for a hotel that is unknown, hidden in this environment or synthetic, 503 when the store fails.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await context.params
  const params = request.nextUrl.searchParams
  const query = searchQuerySchema.safeParse({
    q: params.get('q') ?? undefined,
    limit: params.get('limit') ?? undefined,
  })
  if (!query.success) return apiError(400, SEARCH_QUERY_ERROR)
  const hotel = await loadVisibleHotel(hotelId)
  if (!hotel || !isRealHotelId(hotel.id)) return apiError(404, NOT_FOUND_ERROR)

  const { q, limit } = query.data
  const chunks = await searchHotelChunks(hotel.id, q, limit)
  const evidence =
    chunks &&
    (await loadEvidence(
      hotel.id,
      chunks.map((chunk) => chunk.evidenceId),
    ))
  if (!chunks || !evidence) return apiError(503, STORE_ERROR)
  const sources = new Map(evidence.map((item) => [item.id, item]))
  return Response.json(
    {
      hotelId: hotel.id,
      query: q,
      chunks: chunks.map(({ evidenceId, ...chunk }) => ({ ...chunk, evidence: sources.get(evidenceId) ?? null })),
    } satisfies SearchResponse,
    { headers: CDN_CACHE_HEADERS },
  )
}
