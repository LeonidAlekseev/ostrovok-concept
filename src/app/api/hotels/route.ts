import { z } from 'zod'
import { apiError, CDN_CACHE_HEADERS } from '@/lib/api'
import { loadBoxHotels, loadCityHotels, loadHotels } from '@/lib/db/catalog'
import { MAX_BOX_SPAN_DEG, parseBox } from '@/lib/mapBox'

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
 * of the ids, unknown ids skipped; `?destinations=x,y` (the search and its map), city by city; or
 * `?bbox=west,south,east,north` (the map around a hotel), the hotels in the box.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const bbox = params.get('bbox')
  if (bbox !== null) {
    const box = params.size === 1 ? parseBox(bbox) : null
    if (!box) return apiError(400, `Pass bbox alone: west,south,east,north, at most ${MAX_BOX_SPAN_DEG}° a side`)
    return answer(() => loadBoxHotels(box))
  }
  const query = querySchema.safeParse({
    ids: params.get('ids') ?? undefined,
    destinations: params.get('destinations') ?? undefined,
  })
  if (!query.success) return apiError(400, `Pass ids or destinations: 1…${MAX_IDS} comma-separated ids`)

  const { ids, destinations } = query.data
  return answer(() => (ids ? loadHotels(ids) : loadCityHotels(destinations!)))
}

/** The hotels with a short CDN life, or 503 when the catalogue fails. */
async function answer(load: () => Promise<unknown[]>) {
  try {
    return Response.json({ hotels: await load() }, { headers: CDN_CACHE_HEADERS })
  } catch (error) {
    console.error('GET /api/hotels:', error instanceof Error ? error.message : error)
    return apiError(503, 'Catalog unavailable')
  }
}
