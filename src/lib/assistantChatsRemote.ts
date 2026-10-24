import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from './db/database.types'
import { byRecent, parseChat, type Chat, type ChatMessage } from './assistantChats'

/**
 * The chats of a signed-in user in Supabase, under RLS «only the owner's» (supabase/migrations/…_assistant_chats.sql).
 * The browser's client writes them with the user's session: the user id comes from `auth.uid()`. Any failure throws;
 * the caller keeps the chat in memory and tries again on the next change.
 */

type Client = SupabaseClient<Database>

/** Chats a user sees in the list. */
export const REMOTE_CHATS = 50

const chatRow = (chat: Chat) => ({
  id: chat.id,
  title: chat.title,
  brief: chat.brief as NonNullable<Json>,
  question: chat.question as Json | null,
  unread: chat.unread,
  created_at: chat.createdAt,
  updated_at: chat.updatedAt,
})

const messageRow = (chatId: string, message: ChatMessage) => ({
  id: message.id,
  chat_id: chatId,
  role: message.role,
  status: message.status,
  text: message.text,
  data: message.data as NonNullable<Json>,
  created_at: message.createdAt,
  updated_at: new Date().toISOString(),
})

const fail = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`${what}: ${error.message}`)
}

/** The user's newest chats with their messages; a damaged row is skipped. */
export async function loadRemoteChats(client: Client): Promise<Chat[]> {
  const { data, error } = await client
    .from('assistant_chats')
    .select(
      'id, title, brief, question, unread, createdAt:created_at, updatedAt:updated_at, messages:assistant_messages(id, role, status, text, data, createdAt:created_at)',
    )
    .order('updated_at', { ascending: false })
    .order('created_at', { referencedTable: 'assistant_messages' })
    .limit(REMOTE_CHATS)
  fail('assistant_chats', error)
  return (data ?? []).flatMap((row) => parseChat(row) ?? []).sort(byRecent)
}

/** Writes the chat and the given messages of it (all of them by default). */
export async function saveRemoteChat(client: Client, chat: Chat, messages: readonly ChatMessage[] = chat.messages) {
  const { error } = await client.from('assistant_chats').upsert(chatRow(chat))
  fail('assistant_chats', error)
  if (messages.length === 0) return
  const { error: messageError } = await client
    .from('assistant_messages')
    .upsert(messages.map((m) => messageRow(chat.id, m)))
  fail('assistant_messages', messageError)
}

/** Deletes the messages gone from a chat (a pending step replaced by the turn's steps). */
export async function deleteRemoteMessages(client: Client, ids: readonly string[]) {
  if (ids.length === 0) return
  const { error } = await client
    .from('assistant_messages')
    .delete()
    .in('id', [...ids])
  fail('assistant_messages', error)
}

/** Deletes the chat with its messages (they go with it: `on delete cascade`). */
export async function deleteRemoteChat(client: Client, chatId: string) {
  const { error } = await client.from('assistant_chats').delete().eq('id', chatId)
  fail('assistant_chats', error)
}
