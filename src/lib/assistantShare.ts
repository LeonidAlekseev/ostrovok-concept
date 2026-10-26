import type { SupabaseClient } from '@supabase/supabase-js'
import type { Brief } from './assistant'
import { isBrief } from './assistantDialog'
import { chatTitle, parseMessage, type Chat, type ChatMessage } from './assistantChats'
import { PHOTO_BUCKET } from './assistantChatsRemote'
import type { Database, Json } from './db/database.types'
import { SHARED_PHOTO_BUCKET, orphanSharedPhotos, removeSharedPhotos, sharePhotoPaths } from './sharedPhotos'

export { SHARED_PHOTO_BUCKET }

/**
 * «Поделиться» a chat with Эвал: a read-only snapshot of it in `assistant_chat_shares`
 * (supabase/migrations/…_assistant_chat_shares.sql) opened by anyone at `/assistant/shared/<id>`. Only a signed-in
 * user shares, with their session (RLS: their own rows); anyone reads one snapshot by id through the
 * `assistant_chat_share` function. Until the migration is applied, sharing fails with `SHARE_ERROR`. The photos of
 * the chat are copied to the public bucket `SHARED_PHOTO_BUCKET` under the snapshot's id, so anyone with the link
 * sees them; deleting the chat leaves them, deleting the snapshot (`deleteShare`) removes them (src/lib/sharedPhotos.ts).
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
export const UNSHARE_ERROR = 'Не получилось удалить ссылку на чат. Попробуйте ещё раз позже.'

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

/**
 * The snapshot's photos copied from the private bucket to the public one, at `<user_id>/<share_id>/<n>.webp`, with
 * their public links and the paths of the copies. A photo that is not copied reads «Фото» in the snapshot; a preview
 * that never reached Storage stays as it is.
 */
async function sharePhotos(
  client: Client,
  shareId: string,
  snapshot: ShareSnapshot,
): Promise<{ snapshot: ShareSnapshot; copied: string[] }> {
  const copied: string[] = []
  if (!snapshot.messages.some((m) => m.data.attachments?.some((a) => a.path))) return { snapshot, copied }
  const { data } = await client.auth.getSession()
  const userId = data.session?.user.id
  const own = client.storage.from(PHOTO_BUCKET)
  let n = 0
  const messages: ChatMessage[] = []
  for (const message of snapshot.messages) {
    const attachments = message.data.attachments
    if (!attachments) {
      messages.push(message)
      continue
    }
    const copies = []
    for (const { path, preview, width, height } of attachments) {
      const size = { width, height }
      if (!path) {
        copies.push(preview ? { ...size, preview } : size)
        continue
      }
      const to = `${userId}/${shareId}/${n++}.${path.endsWith('.jpg') ? 'jpg' : 'webp'}`
      const { error } = userId
        ? await own.copy(path, to, { destinationBucket: SHARED_PHOTO_BUCKET })
        : { error: { message: 'no session' } }
      if (error) {
        console.warn(`${SHARED_PHOTO_BUCKET}: ${error.message.slice(0, 200)}`)
        copies.push(size)
      } else {
        copied.push(to)
        copies.push({ ...size, url: client.storage.from(SHARED_PHOTO_BUCKET).getPublicUrl(to).data.publicUrl })
      }
    }
    messages.push({ ...message, data: { ...message.data, attachments: copies } })
  }
  return { snapshot: { ...snapshot, messages }, copied }
}

/** Removes the photos; a failure is only told, the snapshot's own fate does not wait on them. */
async function removePhotos(client: Client, paths: readonly string[]) {
  if (paths.length === 0) return
  await removeSharedPhotos(client.storage.from(SHARED_PHOTO_BUCKET), paths).catch((error: Error) =>
    console.warn(error.message),
  )
}

/** Saves the snapshot of the chat; the id of the link. Any failure throws `SHARE_ERROR`. */
export async function shareChat(client: Client, chat: Chat): Promise<string> {
  // The id is made here: the photos are copied under it before the snapshot is written.
  const id = crypto.randomUUID()
  const { snapshot, copied } = await sharePhotos(client, id, snapshotOf(chat))
  const { data, error } = await client
    .from('assistant_chat_shares')
    .insert({ id, title: snapshot.title.slice(0, 200), snapshot: snapshot as unknown as NonNullable<Json> })
    .select('id')
    .single()
  if (error || !data) {
    console.warn(`assistant_chat_shares: ${error?.message.slice(0, 200) ?? 'no row'}`)
    // No snapshot, no one to see its photos.
    await removePhotos(client, copied)
    throw new Error(SHARE_ERROR)
  }
  return data.id
}

/**
 * Deletes the user's snapshot and then its photos, with the photos the user's earlier snapshots left (deleted by
 * hand, or their photos failed to go). Throws `UNSHARE_ERROR` when the snapshot is not deleted; the photos that fail
 * stay for `npm run db:clean:shared-photos`.
 */
export async function deleteShare(client: Client, id: string): Promise<void> {
  if (!isShareId(id)) return
  const { error } = await client.from('assistant_chat_shares').delete().eq('id', id)
  if (error) {
    console.warn(`assistant_chat_shares: ${error.message.slice(0, 200)}`)
    throw new Error(UNSHARE_ERROR)
  }
  const { data } = await client.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return
  const bucket = client.storage.from(SHARED_PHOTO_BUCKET)
  const paths = await sharePhotoPaths(bucket, `${userId}/${id}`).catch(() => [])
  // The other folders go only when the snapshots that remain are known: a folder of a snapshot is never taken.
  const { data: rows, error: rowsError } = await client.from('assistant_chat_shares').select('id')
  const orphans = rowsError
    ? []
    : await orphanSharedPhotos(bucket, userId, new Set(rows.map((r) => r.id))).catch((e: Error) => {
        console.warn(e.message)
        return []
      })
  await removePhotos(client, [...new Set([...paths, ...orphans])])
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
