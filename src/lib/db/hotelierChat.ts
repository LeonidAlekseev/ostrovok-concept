import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/database.types'
import {
  CONVERSATION_COLUMNS,
  MESSAGE_COLUMNS,
  conversationOf,
  messageOf,
  type ConversationStatus,
  type HotelierConversation,
  type HotelierMessage,
} from '@/lib/hotelierChat'

/**
 * The writes of the chats with the hoteliers (supabase/migrations/20261028130000_hotelier_chat.sql), as the user of the
 * request: the client with their session, under RLS — no service role. The database itself checks who writes as whom,
 * keeps a closed chat closed and lets one author write 20 messages a minute; this module only tells its failures
 * apart. It reads only the columns a user may select (`CONVERSATION_COLUMNS`, `MESSAGE_COLUMNS`): never who the
 * traveller is. A failure is logged by its code, never with the message.
 */

type Client = SupabaseClient<Database>

export type ChatFailure = 'forbidden' | 'closed' | 'rate_limited' | 'not_found' | 'store'

export type ChatResult<T> = { ok: true; value: T } | { ok: false; failure: ChatFailure }

interface PostgrestFailure {
  code?: string
  message?: string
}

/** What the database's refusal means: RLS, the closed chat, the limit of its trigger. */
function failureOf(error: PostgrestFailure, what: string): ChatFailure {
  if (error.code === '42501') return 'forbidden'
  if (error.code === 'P0001' && error.message === 'hotelier_conversation_closed') return 'closed'
  if (error.code === 'P0001' && error.message === 'hotelier_rate_limited') return 'rate_limited'
  // A missing conversation of a message is its foreign key.
  if (error.code === '23503') return 'not_found'
  console.warn(`hotelier chat: ${what} (${String(error.code ?? 'error').slice(0, 40)})`)
  return 'store'
}

const fail = <T>(failure: ChatFailure): ChatResult<T> => ({ ok: false, failure })

/** The signed-in user's id, checked by Supabase Auth; `null` for a guest. */
export async function signedInUser(client: Client): Promise<string | null> {
  const { data } = await client.auth.getUser()
  return data.user?.id ?? null
}

/**
 * The traveller's open chat with the hotel, started when there is none (a parallel start finds the other one's). Their
 * newest chat with it is the open one, if any: a new chat starts only after the last one closed.
 */
async function openChat(client: Client, userId: string, hotelId: string): Promise<ChatResult<HotelierConversation>> {
  const find = () =>
    client
      .rpc('hotelier_traveller_chat', { hotel_id: hotelId })
      .select(CONVERSATION_COLUMNS)
      .neq('status', 'closed')
      .maybeSingle()
  const found = await find()
  if (found.error) return fail(failureOf(found.error, 'chat not read'))
  if (found.data) return { ok: true, value: conversationOf(found.data) }
  const created = await client
    .from('hotelier_conversations')
    .insert({ hotel_id: hotelId, user_id: userId })
    .select(CONVERSATION_COLUMNS)
    .single()
  if (!created.error) return { ok: true, value: conversationOf(created.data) }
  if (created.error.code !== '23505') return fail(failureOf(created.error, 'chat not started'))
  const again = await find()
  if (again.error || !again.data) return fail(again.error ? failureOf(again.error, 'chat not read') : 'store')
  return { ok: true, value: conversationOf(again.data) }
}

/** The traveller's message to the hotel, into their open chat with it. */
export async function sendTravellerMessage(
  client: Client,
  userId: string,
  hotelId: string,
  text: string,
): Promise<ChatResult<{ conversation: HotelierConversation; message: HotelierMessage }>> {
  const chat = await openChat(client, userId, hotelId)
  if (!chat.ok) return chat
  const { data, error } = await client
    .from('hotelier_messages')
    .insert({ conversation_id: chat.value.id, sender: 'user', author_id: userId, text })
    .select(MESSAGE_COLUMNS)
    .single()
  if (error) return fail(failureOf(error, 'message not written'))
  return { ok: true, value: { conversation: chat.value, message: messageOf(data) } }
}

/**
 * The hotelier's answer in a conversation of their hotel: RLS refuses anyone else. Without `requestId` it answers the
 * conversation's only open request, if there is one.
 */
export async function sendHotelierMessage(
  client: Client,
  userId: string,
  conversationId: string,
  { text, shareable, requestId }: { text: string; shareable: boolean; requestId?: string },
): Promise<ChatResult<HotelierMessage>> {
  // An answer without its request answers the conversation's only open one: the panel may send before it read it.
  let request = requestId ?? null
  if (!request) {
    const { data: open } = await client
      .from('hotelier_requests')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('status', 'pending')
      .limit(2)
    if (open?.length === 1) request = open[0].id
  }
  const { data, error } = await client
    .from('hotelier_messages')
    .insert({
      conversation_id: conversationId,
      sender: 'hotelier',
      author_id: userId,
      text,
      shareable,
      request_id: request,
    })
    .select(MESSAGE_COLUMNS)
    .single()
  if (error) return fail(failureOf(error, 'answer not written'))
  return { ok: true, value: messageOf(data) }
}

/**
 * The hotelier's answer `messageId` finishes the request, as the hotelier: the request, the waiting runs of Эвал and
 * the traveller's chat change in one transaction (`answer_hotelier_request`). The runs finished; none for a request
 * already answered or not the caller's hotel's.
 */
export async function answerRequest(client: Client, requestId: string, messageId: string): Promise<string[]> {
  const { data, error } = await client.rpc('answer_hotelier_request', { request_id: requestId, message_id: messageId })
  if (error) {
    failureOf(error, 'request not answered')
    return []
  }
  return (data ?? []) as string[]
}

/**
 * The hotelier may withdraw the knowledge of `messageId`: it is their answer (`sender = 'hotelier'`) in a conversation
 * of their hotel — the database's to say (`hotelier_own_answer`), as the author is a hidden column.
 */
export async function ownAnswer(client: Client, messageId: string): Promise<boolean> {
  const { data, error } = await client.rpc('hotelier_own_answer', { message_id: messageId })
  if (error) failureOf(error, 'answer not read')
  return data === true
}

/** A new state of the conversation; the database's function decides who may set it. */
export async function setConversationStatus(
  client: Client,
  conversationId: string,
  status: ConversationStatus,
): Promise<ChatResult<HotelierConversation>> {
  const { data: allowed, error } = await client.rpc('hotelier_conversation_status', {
    conversation_id: conversationId,
    status,
  })
  if (error) return fail(failureOf(error, 'status not set'))
  if (!allowed) return fail('forbidden')
  const { data, error: readError } = await client
    .from('hotelier_conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('id', conversationId)
    .single()
  if (readError) return fail(failureOf(readError, 'chat not read'))
  return { ok: true, value: conversationOf(data) }
}
