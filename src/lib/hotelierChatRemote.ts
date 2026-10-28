import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './db/database.types'
import {
  conversationOf,
  messageOf,
  requestOf,
  type ConversationRow,
  type HotelierConversation,
  type HotelierMessage,
  type HotelierRequest,
  type MessageRow,
  type RequestRow,
} from './hotelierChat'

/**
 * The browser's reads of the chats with the hoteliers, under RLS: the traveller reads their own, the hotelier those of
 * their hotels. Realtime brings the new rows of the same policies. Writes go through the routes (the limits and the
 * checks are the server's); only «read» is a call of the database's function.
 */

type Client = SupabaseClient<Database>

/** The conversations of the hotelier's list at most, newest first. */
export const INBOX_LIMIT = 200
/** The messages of a conversation at most, the newest. */
export const MESSAGES_LIMIT = 500

const CONVERSATION_COLUMNS = '*, hotel:hotels(name:data->>name)'

/** The traveller's newest chat with the hotel, closed or not; `null` when there is none. */
export async function loadHotelChat(client: Client, hotelId: string): Promise<HotelierConversation | null> {
  const { data: auth } = await client.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return null
  // A hotelier sees every chat of the hotel: the traveller's own is asked by their id.
  const { data, error } = await client
    .from('hotelier_conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('hotel_id', hotelId)
    .eq('kind', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data && conversationOf(data)
}

/** The conversations the hotelier may answer, newest first. */
export async function loadInbox(client: Client): Promise<HotelierConversation[]> {
  const { data, error } = await client
    .from('hotelier_conversations')
    .select(CONVERSATION_COLUMNS)
    .order('last_message_at', { ascending: false })
    .limit(INBOX_LIMIT)
  if (error) throw new Error(error.message)
  return (data as unknown as ConversationRow[]).map(conversationOf)
}

export async function loadMessages(client: Client, conversationId: string): Promise<HotelierMessage[]> {
  const { data, error } = await client
    .from('hotelier_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(MESSAGES_LIMIT)
  if (error) throw new Error(error.message)
  return data.map(messageOf).reverse()
}

export async function loadRequests(client: Client, conversationId: string): Promise<HotelierRequest[]> {
  const { data, error } = await client
    .from('hotelier_requests')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data.map(requestOf)
}

/** The caller has read the conversation: their side's unread count goes to 0. */
export async function markRead(client: Client, conversationId: string) {
  const { error } = await client.rpc('hotelier_conversation_read', { conversation_id: conversationId })
  if (error) throw new Error(error.message)
}

export async function isHotelier(client: Client): Promise<boolean> {
  const { data, error } = await client.rpc('is_hotelier')
  if (error) throw new Error(error.message)
  return data === true
}

let channels = 0

/**
 * The Realtime connection with the user's token before a channel joins: the browser's client connects with the anon
 * key, and the policies would refuse every row of the subscription (`Error 401: Unauthorized`).
 */
async function authorize(client: Client) {
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (token) await client.realtime.setAuth(token)
}

/** The channel joins once authorized, unless it was removed meanwhile; the returned function removes it. */
function join(client: Client, channel: RealtimeChannel): () => void {
  let removed = false
  void authorize(client)
    .catch(() => undefined)
    .then(() => {
      if (!removed) channel.subscribe()
    })
  return () => {
    removed = true
    void client.removeChannel(channel)
  }
}

/** The row of an event, or `null` for one the policies refused or a deletion. */
const rowOf = <T>(payload: { new: unknown; errors?: unknown }): T | null => {
  const row = payload.new as { id?: unknown } | null
  return !payload.errors && row && typeof row.id === 'string' ? (row as T) : null
}

/**
 * Follows a conversation: its new messages, its changes and its requests. Each subscription is a channel of its own,
 * so two chats open at once never share one; the returned function removes it.
 */
export function followConversation(
  client: Client,
  conversationId: string,
  on: {
    message: (message: HotelierMessage) => void
    conversation: (conversation: HotelierConversation) => void
    request?: (request: HotelierRequest) => void
  },
): () => void {
  const filter = `conversation_id=eq.${conversationId}`
  channels += 1
  let channel: RealtimeChannel = client
    .channel(`hotelier-conversation:${conversationId}:${channels}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hotelier_messages', filter }, (payload) => {
      const row = rowOf<MessageRow>(payload)
      if (row) on.message(messageOf(row))
    })
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'hotelier_conversations', filter: `id=eq.${conversationId}` },
      (payload) => {
        const row = rowOf<ConversationRow>(payload)
        if (row) on.conversation(conversationOf(row))
      },
    )
  if (on.request) {
    const request = on.request
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'hotelier_requests', filter },
      (payload) => {
        const row = rowOf<RequestRow>(payload)
        if (row) request(requestOf(row))
      },
    )
  }
  return join(client, channel)
}

/** Follows the hotelier's list: every conversation of their hotels that starts or changes. */
export function followInbox(client: Client, on: (conversation: HotelierConversation) => void): () => void {
  channels += 1
  const channel = client
    .channel(`hotelier-inbox:${channels}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hotelier_conversations' }, (payload) => {
      const row = rowOf<ConversationRow>(payload)
      if (row) on(conversationOf(row))
    })
  return join(client, channel)
}
