import type { SupabaseClient } from '@supabase/supabase-js'
import type { Brief } from './assistant'
import { isBrief } from './assistantDialog'
import { chatTitle, parseMessage, type Chat, type ChatMessage } from './assistantChats'
import type { Database, Json } from './db/database.types'

/**
 * «Поделиться» a chat with Эвал: a read-only snapshot of it in `assistant_chat_shares`
 * (supabase/migrations/…_assistant_chat_shares.sql) opened by anyone at `/assistant/shared/<id>`. Only a signed-in
 * user shares, with their session (RLS: their own rows); anyone reads one snapshot by id through the
 * `assistant_chat_share` function. Until the migration is applied, sharing fails with `SHARE_ERROR`.
 */

type Client = SupabaseClient<Database>

export interface ShareSnapshot {
  title: string
  brief: Brief
  /** The finished messages: no pending answer or step. */
  messages: ChatMessage[]
}

export interface SharedChat extends ShareSnapshot {
  id: string
  createdAt: string
}

export const SHARE_ERROR = 'Не получилось поделиться чатом. Попробуйте ещё раз позже.'

export const shareHref = (id: string) => `/assistant/shared/${id}`

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isShareId = (id: string) => UUID.test(id)

/** The chat as it is now, without what is still on its way. */
export const snapshotOf = (chat: Chat): ShareSnapshot => ({
  title: chat.title || chatTitle(chat.messages.find((m) => m.role === 'user')?.text ?? ''),
  brief: chat.brief,
  messages: chat.messages.filter((m) => m.status !== 'pending'),
})

/** A snapshot read back; a damaged message is skipped, a damaged snapshot reads as none. */
export function parseSnapshot(value: unknown): ShareSnapshot | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { title, brief, messages } = value as Record<string, unknown>
  if (typeof title !== 'string' || !isBrief(brief) || !Array.isArray(messages)) return null
  return { title, brief, messages: messages.flatMap((m) => parseMessage(m) ?? []) }
}

/** Saves the snapshot of the chat; the id of the link. Any failure throws `SHARE_ERROR`. */
export async function shareChat(client: Client, chat: Chat): Promise<string> {
  const snapshot = snapshotOf(chat)
  const { data, error } = await client
    .from('assistant_chat_shares')
    .insert({ title: snapshot.title.slice(0, 200), snapshot: snapshot as unknown as NonNullable<Json> })
    .select('id')
    .single()
  if (error || !data) {
    console.warn(`assistant_chat_shares: ${error?.message.slice(0, 200) ?? 'no row'}`)
    throw new Error(SHARE_ERROR)
  }
  return data.id
}

/** The shared chat of the id; `null` for an unknown or malformed id, or when the snapshots are unavailable. */
export async function loadSharedChat(client: Client, id: string): Promise<SharedChat | null> {
  if (!isShareId(id)) return null
  const { data, error } = await client.rpc('assistant_chat_share', { share_id: id })
  if (error) {
    console.warn(`assistant_chat_share: ${error.message.slice(0, 200)}`)
    return null
  }
  const row = data?.[0]
  const snapshot = row && parseSnapshot(row.snapshot)
  return row && snapshot
    ? { ...snapshot, title: row.title || snapshot.title, id: row.id, createdAt: row.created_at }
    : null
}
