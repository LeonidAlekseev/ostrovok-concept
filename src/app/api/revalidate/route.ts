import { revalidateTag } from 'next/cache'
import { apiError, hasServiceRoleKey } from '@/lib/api'
import { CATALOG_TAG } from '@/lib/db/anon'
import { FORBIDDEN, type RevalidateResponse } from './schema'

/**
 * Drops the cached catalogue after `npm run db:seed -- --revalidate <site>`: the next request of each page
 * reads Supabase again. Only for the bearer of the service role key, which only the seed script has.
 */
export async function POST(request: Request) {
  if (!(await hasServiceRoleKey(request))) return apiError(403, FORBIDDEN)
  revalidateTag(CATALOG_TAG, { expire: 0 })
  return Response.json({ revalidated: [CATALOG_TAG] } satisfies RevalidateResponse)
}
