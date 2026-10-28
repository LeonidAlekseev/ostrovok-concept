import { z } from 'zod'
import { apiError } from '@/lib/api'
import { allowRequest, clientIp } from '@/lib/ai/rateLimit'
import { sendHotelierMessage, signedInUser } from '@/lib/db/hotelierChat'
import { createClient } from '@/lib/supabase/server'
import { failureResponse, jsonBody } from '../../../respond'
import {
  BODY_ERROR,
  NOT_FOUND_ERROR,
  RATE_ERROR,
  STORE_ERROR,
  UNAUTHORIZED_ERROR,
  hotelierMessageSchema,
} from '../../../schema'

/**
 * The hotelier's answer in a conversation of their hotel. The database checks the right (`is_hotelier_of`): anyone
 * else gets 403. 400 for a bad body, 401 for a guest, 404 for an unknown conversation, 409 for a closed one, 429 over
 * the limits, 503 when the database fails.
 */
export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await context.params
  if (!z.uuid().safeParse(conversationId).success) return apiError(404, NOT_FOUND_ERROR)
  const body = hotelierMessageSchema.safeParse(await jsonBody(request))
  if (!body.success) return apiError(400, BODY_ERROR)
  const client = await createClient()
  if (!client) return apiError(503, STORE_ERROR)
  const userId = await signedInUser(client)
  if (!userId) return apiError(401, UNAUTHORIZED_ERROR)
  if (!(await allowRequest(clientIp(request)))) return apiError(429, RATE_ERROR)
  const result = await sendHotelierMessage(client, userId, conversationId, body.data)
  return result.ok ? Response.json(result.value) : failureResponse(result.failure)
}
