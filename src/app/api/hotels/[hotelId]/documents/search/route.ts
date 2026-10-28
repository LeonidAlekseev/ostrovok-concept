import type { NextRequest } from 'next/server'
import { apiError, CDN_CACHE_HEADERS, loadVisibleHotel } from '@/lib/api'
import { isRealHotelId } from '@/lib/db/anon'
import { NVIDIA_KEY } from '@/lib/ai/nvidia'
import { queryVector } from '@/lib/ai/semantic'
import { loadEvidence, searchHotelKnowledge } from '@/lib/db/claims'
import { getSecret } from '@/lib/secrets'
import { NOT_FOUND_ERROR, SEARCH_QUERY_ERROR, STORE_ERROR, searchQuerySchema, type SearchResponse } from './schema'

/** The query's vector waits this long at most: without it the search is by the words alone. */
const VECTOR_MS = 4000

/** The query's vector for the meaning part of the search; `null` without the key, on a failure or too late. */
async function vectorOf(text: string): Promise<number[] | null> {
  const key = await getSecret(NVIDIA_KEY).catch(() => undefined)
  if (!key) return null
  return Promise.race([
    queryVector(key, text).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), VECTOR_MS)),
  ])
}

/**
 * The chunks of the documents of a real hotel — the guests' reviews and the hotel's knowledge from its hotelier — for
 * `?q=` (`hotel_chunks_hybrid`: full text and meaning fused by reciprocal rank), each with the evidence it cites. The
 * query goes to the search as it is. The texts are untrusted, passed on as data: 400 for a bad query, 404 for a hotel
 * that is unknown, hidden in this environment or synthetic, 503 when the store fails.
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
  const chunks = await searchHotelKnowledge(hotel.id, q, limit, await vectorOf(q))
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
