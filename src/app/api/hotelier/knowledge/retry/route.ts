import { apiError, hasCronSecret, hasServiceRoleKey } from '@/lib/api'
import { processDueHotelierKnowledge } from '@/lib/db/hotelierKnowledge'
import { FORBIDDEN, RETRY_LIMIT, type KnowledgeRetryResponse } from './schema'

/** Runs one batch; the bearer of the service role key (`POST`, a script) or of `CRON_SECRET` (`GET`, Vercel Cron). */
async function retry(request: Request, allowed: (request: Request) => Promise<boolean>) {
  if (!(await allowed(request))) return apiError(403, FORBIDDEN)
  const processed = await processDueHotelierKnowledge(RETRY_LIMIT)
  return Response.json({ processed } satisfies KnowledgeRetryResponse)
}

/**
 * The scheduled retry of the hoteliers' knowledge: the due answers are processed now, not after somebody reads a hotel.
 * Vercel Cron (`vercel.json`) calls it with GET and `Authorization: Bearer $CRON_SECRET`.
 */
export const GET = (request: Request) => retry(request, hasCronSecret)

/** The same for the operator's scripts, with the service role key. */
export const POST = (request: Request) => retry(request, hasServiceRoleKey)

// A scheduled call must not be answered from a cache.
export const dynamic = 'force-dynamic'
