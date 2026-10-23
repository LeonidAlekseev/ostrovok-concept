import { timingSafeEqual } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { CATALOG_TAG } from '@/lib/db/catalog'
import { ROUTES_TAG } from '@/lib/db/routes'
import { getSecret } from '@/lib/secrets'

const sameSecret = (given: string, expected: string) =>
  given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected))

/**
 * Drops the cached catalogue and routes after `npm run db:seed -- --revalidate <site>`: the next request of each page
 * reads Supabase again. Only for the bearer of the service role key, which only the seed script has.
 */
export async function POST(request: Request) {
  const expected = await getSecret('SUPABASE_SERVICE_ROLE_KEY')
  const given = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  if (!expected || !sameSecret(given, expected)) return Response.json({ error: 'Forbidden' }, { status: 403 })
  revalidateTag(CATALOG_TAG, { expire: 0 })
  revalidateTag(ROUTES_TAG, { expire: 0 })
  return Response.json({ revalidated: [CATALOG_TAG, ROUTES_TAG] })
}
