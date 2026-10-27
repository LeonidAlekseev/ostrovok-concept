import 'server-only'
import { isVisibleHotel, type Hotel } from '@/lib/catalog'
import { loadHotel } from '@/lib/db/catalog'

/**
 * What the route handlers of src/app/api share: the CDN's cache of a public answer and the shape of an error. Every
 * answer is JSON; an error is `{ error }` with a short English text for the logs and the developer — the browser
 * looks only at the status and says it in Russian itself.
 */

/**
 * A short CDN life for the public reads: the server's cache of the catalogue, unlike the CDN's, is dropped by
 * `POST /api/revalidate`, so the CDN keeps an answer five minutes and serves a stale one for an hour while refreshing.
 */
export const CDN_CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } as const

/** An error answer: `{ error: message }` with the status. */
export const apiError = (status: number, message: string) => Response.json({ error: message }, { status })

/** The hotel of a `[hotelId]` route when it is shown in this environment, else `undefined` (unknown or hidden). */
export const loadVisibleHotel = async (hotelId: string): Promise<Hotel | undefined> =>
  isVisibleHotel({ id: hotelId }) ? loadHotel(hotelId) : undefined
