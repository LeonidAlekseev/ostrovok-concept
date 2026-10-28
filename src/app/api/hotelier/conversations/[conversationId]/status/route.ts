import { z } from 'zod'
import { apiError } from '@/lib/api'
import { setConversationStatus, signedInUser } from '@/lib/db/hotelierChat'
import { createClient } from '@/lib/supabase/server'
import { failureResponse, jsonBody } from '../../../respond'
import { FORBIDDEN_ERROR, STATUS_ERROR, STORE_ERROR, UNAUTHORIZED_ERROR, statusSchema } from '../../../schema'

/**
 * A new state of a conversation: the hotelier's of its hotel (open, resolved, closed) or its traveller's (closed). The
 * database's function decides; 403 when it refuses or there is no such conversation.
 */
export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await context.params
  if (!z.uuid().safeParse(conversationId).success) return apiError(403, FORBIDDEN_ERROR)
  const body = statusSchema.safeParse(await jsonBody(request))
  if (!body.success) return apiError(400, STATUS_ERROR)
  const client = await createClient()
  if (!client) return apiError(503, STORE_ERROR)
  if (!(await signedInUser(client))) return apiError(401, UNAUTHORIZED_ERROR)
  const result = await setConversationStatus(client, conversationId, body.data.status)
  return result.ok ? Response.json(result.value) : failureResponse(result.failure)
}
