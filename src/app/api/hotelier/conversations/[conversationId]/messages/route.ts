import { after } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/api'
import { allowRequest, clientIp } from '@/lib/ai/rateLimit'
import { answerRequest, sendHotelierMessage, signedInUser } from '@/lib/db/hotelierChat'
import { processHotelierAnswer, retryDueHotelierKnowledge } from '@/lib/db/hotelierKnowledge'
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
 * else gets 403. An answer to a request finishes it at once, as the hotelier (`answer_hotelier_request`: the waiting
 * runs of Эвал, the traveller's chat); its knowledge — the characteristics of a shareable answer, the documents of the
 * search — is the server's after the response (`after`), so nothing waits for the model; the answers whose knowledge
 * failed before are tried again then too. 400 for a bad body, 401 for a
 * guest, 404 for an unknown conversation, 409 for a closed one, 429 over the limits, 503 when the database fails.
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
  if (!result.ok) return failureResponse(result.failure)
  const message = result.value
  if (message.requestId) await answerRequest(client, message.requestId, message.id)
  // A shareable answer is due for its knowledge from the moment it is written; a try that fails is due again later.
  after(async () => {
    if (message.shareable) await processHotelierAnswer(message.id)
    await retryDueHotelierKnowledge()
  })
  return Response.json(message)
}
