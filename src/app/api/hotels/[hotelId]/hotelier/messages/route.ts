import { apiError, loadVisibleHotel } from '@/lib/api'
import { allowRequest, clientIp } from '@/lib/ai/rateLimit'
import { sendTravellerMessage, signedInUser } from '@/lib/db/hotelierChat'
import { createClient } from '@/lib/supabase/server'
import { failureResponse, jsonBody } from '../../../../hotelier/respond'
import {
  BODY_ERROR,
  NOT_FOUND_ERROR,
  RATE_ERROR,
  STORE_ERROR,
  UNAUTHORIZED_ERROR,
  travellerMessageSchema,
} from '../../../../hotelier/schema'

/**
 * The signed-in traveller's message to the hotel's hotelier, into their open chat with the hotel (a new one when there
 * is none). Written as the traveller under RLS; the hotelier answers in their panel, and the browser gets it by
 * Realtime. 400 for a bad text, 401 for a guest, 404 for an unknown or hidden hotel, 409 for a closed chat, 429 over
 * the limits, 503 when the database fails.
 */
export async function POST(request: Request, context: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = await context.params
  const body = travellerMessageSchema.safeParse(await jsonBody(request))
  if (!body.success) return apiError(400, BODY_ERROR)
  const client = await createClient()
  if (!client) return apiError(503, STORE_ERROR)
  const userId = await signedInUser(client)
  if (!userId) return apiError(401, UNAUTHORIZED_ERROR)
  if (!(await allowRequest(clientIp(request)))) return apiError(429, RATE_ERROR)
  const hotel = await loadVisibleHotel(hotelId).catch(() => undefined)
  if (!hotel) return apiError(404, NOT_FOUND_ERROR)
  const result = await sendTravellerMessage(client, userId, hotel.id, body.data.text)
  return result.ok ? Response.json(result.value) : failureResponse(result.failure)
}
