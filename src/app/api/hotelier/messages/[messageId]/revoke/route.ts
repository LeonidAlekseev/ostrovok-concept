import { z } from 'zod'
import { apiError } from '@/lib/api'
import { ownAnswer, signedInUser } from '@/lib/db/hotelierChat'
import { revokeHotelierAnswer } from '@/lib/db/hotelierKnowledge'
import { createClient } from '@/lib/supabase/server'
import { FORBIDDEN_ERROR, STORE_ERROR, UNAUTHORIZED_ERROR } from '../../../schema'
import { after, withStandaloneDb } from '@/lib/standalone/server'

/**
 * The hotelier withdraws the knowledge of their answer: its claims end (kept with «Отозвано отельером») and its
 * document leaves the search, by the server after the response. 202 when accepted; 401 for a guest, 403 for a message
 * that is not the caller's answer, 503 without the database.
 */
async function handlePOST(_request: Request, context: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await context.params
  if (!z.uuid().safeParse(messageId).success) return apiError(403, FORBIDDEN_ERROR)
  const client = await createClient()
  if (!client) return apiError(503, STORE_ERROR)
  const userId = await signedInUser(client)
  if (!userId) return apiError(401, UNAUTHORIZED_ERROR)
  if (!(await ownAnswer(client, messageId))) return apiError(403, FORBIDDEN_ERROR)
  after(() => revokeHotelierAnswer(messageId))
  return Response.json({ messageId, revoked: true }, { status: 202 })
}

export const POST = withStandaloneDb(handlePOST)
