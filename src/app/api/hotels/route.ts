import { apiError, CDN_CACHE_HEADERS } from '@/lib/api'
import { loadBoxHotels, loadCityHotels, loadHotels } from '@/lib/db/catalog'
import type { Hotel } from '@/lib/catalog'
import { BBOX_ERROR, CATALOG_ERROR, QUERY_ERROR, bboxSchema, hotelsQuerySchema, type HotelsResponse } from './schema'

/**
 * The full hotels the browser knows only by id: `?ids=a,b` (favourites, trips, the booking), in the order
 * of the ids, unknown ids skipped; `?destinations=x,y` (the search and its map), city by city; or
 * `?bbox=west,south,east,north` (the map around a hotel), the hotels in the box. The schemas: ./schema.ts.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const bbox = params.get('bbox')
  if (bbox !== null) {
    const box = params.size === 1 ? bboxSchema.safeParse(bbox) : null
    if (!box?.success) return apiError(400, BBOX_ERROR)
    return answer(() => loadBoxHotels(box.data))
  }
  const query = hotelsQuerySchema.safeParse({
    ids: params.get('ids') ?? undefined,
    destinations: params.get('destinations') ?? undefined,
  })
  if (!query.success) return apiError(400, QUERY_ERROR)

  const { ids, destinations } = query.data
  return answer(() => (ids ? loadHotels(ids) : loadCityHotels(destinations!)))
}

/** The hotels with a short CDN life, or 503 when the catalogue fails. */
async function answer(load: () => Promise<Hotel[]>) {
  try {
    return Response.json({ hotels: await load() } satisfies HotelsResponse, { headers: CDN_CACHE_HEADERS })
  } catch (error) {
    console.error('GET /api/hotels:', error instanceof Error ? error.message : error)
    return apiError(503, CATALOG_ERROR)
  }
}
