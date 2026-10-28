import { apiError, hasServiceRoleKey } from '@/lib/api'
import { processDueHotelierKnowledge } from '@/lib/db/hotelierKnowledge'
import { FORBIDDEN, RETRY_LIMIT, type KnowledgeRetryResponse } from './schema'

/**
 * The scheduled retry of the hoteliers' knowledge: the due answers are processed now, not after somebody reads a hotel.
 * Only for the bearer of the service role key, which the operator's scheduler has.
 */
export async function POST(request: Request) {
  if (!(await hasServiceRoleKey(request))) return apiError(403, FORBIDDEN)
  const processed = await processDueHotelierKnowledge(RETRY_LIMIT)
  return Response.json({ processed } satisfies KnowledgeRetryResponse)
}
