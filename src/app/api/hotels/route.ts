import { z } from 'zod'
import { loadCityHotels, loadHotels } from '@/lib/db/catalog'

/** At most this many hotels or cities a request. */
const MAX_IDS = 60

const idList = z
  .string()
  .transform((value) => value.split(',').filter(Boolean))
  .pipe(
    z
      .array(z.string().regex(/^[a-z0-9-]{1,80}$/))
      .min(1)
      .max(MAX_IDS),
  )

const querySchema = z.union([
  z.object({ ids: idList, destinations: z.undefined() }),
  z.object({ ids: z.undefined(), destinations: idList }),
])

/**
 * The full hotels the browser knows only by id: `?ids=a,b` (favourites, trips, the booking), in the order
 * of the ids, unknown ids skipped; or `?destinations=x,y` (the search and the map), city by city.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const query = querySchema.safeParse({
    ids: params.get('ids') ?? undefined,
    destinations: params.get('destinations') ?? undefined,
  })
  if (!query.success)
    return Response.json({ error: `Pass ids or destinations: 1…${MAX_IDS} comma-separated ids` }, { status: 400 })

  const { ids, destinations } = query.data
  try {
    const hotels = ids ? await loadHotels(ids) : await loadCityHotels(destinations!)
    return Response.json(
      { hotels },
      // A short CDN life: the server cache, unlike the CDN, is dropped by POST /api/revalidate.
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } },
    )
  } catch (error) {
    console.error('GET /api/hotels:', error instanceof Error ? error.message : error)
    return Response.json({ error: 'Каталог временно недоступен' }, { status: 503 })
  }
}
