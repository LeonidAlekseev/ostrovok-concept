import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from './db/database.types'
import { byRecent, parseChat, withoutPreview, type Attachment, type Chat, type ChatMessage } from './assistantChats'
import { blobToDataUrl } from './imageOptimize'

/**
 * The chats of a signed-in user in Supabase, under RLS «only the owner's» (supabase/migrations/…_assistant_chats.sql).
 * The browser's client writes them with the user's session: the user id comes from `auth.uid()`. Any failure throws;
 * the caller keeps the chat in memory and tries again on the next change. The photos of the messages live in the
 * private bucket `PHOTO_BUCKET` (supabase/migrations/…_assistant_attachments.sql), in the user's own folder.
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

/** The previews a row keeps for the photos not in Storage, within the row's 100 KB of data. */
const MAX_PREVIEWS = 80_000

/**
 * A photo in Storage is written without its preview: the signed link shows it. One that did not reach Storage
 * keeps its preview while they fit; otherwise it reads «Фото».
 */
function storedData({ attachments, ...data }: ChatMessage['data']) {
  if (!attachments) return data
  const kept = attachments.map(({ preview, ...a }) => (a.path ? a : { ...a, preview }))
  const size = kept.reduce((sum, a) => sum + ('preview' in a ? (a.preview?.length ?? 0) : 0), 0)
  return { ...data, attachments: size <= MAX_PREVIEWS ? kept : attachments.map(withoutPreview) }
}

const messageRow = (chatId: string, message: ChatMessage) => ({
  id: message.id,
  chat_id: chatId,
  role: message.role,
  status: message.status,
  text: message.text,
  data: storedData(message.data) as NonNullable<Json>,
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

// ---------------------------------------------------------------------------------------------
// The photos in Storage

export const PHOTO_BUCKET = 'assistant-attachments'
/** A signed link opens the photo this long. */
const SIGNED_URL_SECONDS = 60 * 60
/** An open chat asks for new links at four fifths of that, before the old ones stop working. */
export const SIGNED_URL_REFRESH_MS = SIGNED_URL_SECONDS * 0.8 * 1000

/** The honest line when the photos did not reach the account (no bucket yet, no network). */
export const PHOTO_SAVE_ERROR = 'Не получилось сохранить фото в аккаунте: сейчас они видны только на этом устройстве.'

/** The file of a photo's data URL. */
export function dataUrlBlob(url: string): Blob {
  const [head, data] = url.split(',', 2)
  const type = head.slice('data:'.length, head.indexOf(';'))
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type })
}

/** `<user_id>/<chat_id>/<message_id>/<n>.webp`: the first segment is the owner's, as the policies check. */
export const photoPath = (userId: string, chatId: string, messageId: string, n: number, type: string) =>
  `${userId}/${chatId}/${messageId}/${n}.${type === 'image/jpeg' ? 'jpg' : 'webp'}`

/**
 * Uploads the message's photos (data URLs, in the order of `attachments`) and gives the attachments with their paths.
 * Uploads run together. Any failure throws; the files that got through stay and are overwritten by the next try.
 */
export async function uploadPhotos(
  client: Client,
  userId: string,
  chatId: string,
  message: Pick<ChatMessage, 'id' | 'data'>,
  photos: readonly string[],
): Promise<Attachment[]> {
  const attachments = message.data.attachments ?? []
  return Promise.all(
    attachments.map(async (attachment, n) => {
      const blob = dataUrlBlob(photos[n])
      const path = photoPath(userId, chatId, message.id, n, blob.type)
      const { error } = await client.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: blob.type, upsert: true, cacheControl: '31536000' })
      fail(PHOTO_BUCKET, error)
      return { ...attachment, path }
    }),
  )
}

/** The signed links of the photos, by path; a photo without one is left out. */
export async function signedPhotoUrls(client: Client, paths: readonly string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map()
  const { data, error } = await client.storage.from(PHOTO_BUCKET).createSignedUrls([...paths], SIGNED_URL_SECONDS)
  fail(PHOTO_BUCKET, error)
  return new Map((data ?? []).flatMap((s) => (s.path && s.signedUrl && !s.error ? [[s.path, s.signedUrl]] : [])))
}

/** The photos as data URLs again: a pending answer asked after a reload sends them to the route. */
export async function downloadPhotos(client: Client, paths: readonly string[]): Promise<string[]> {
  return Promise.all(
    paths.map(async (path) => {
      const { data, error } = await client.storage.from(PHOTO_BUCKET).download(path)
      fail(PHOTO_BUCKET, error)
      return blobToDataUrl(data!)
    }),
  )
}

/** The paths of the chat's photos in Storage. */
export const photoPaths = (chat: Chat): string[] =>
  chat.messages.flatMap((m) => m.data.attachments?.flatMap((a) => (a.path ? [a.path] : [])) ?? [])

/** Deletes the photos; the chat is deleted apart, whatever happens to them. */
export async function deleteRemotePhotos(client: Client, paths: readonly string[]) {
  if (paths.length === 0) return
  const { error } = await client.storage.from(PHOTO_BUCKET).remove([...paths])
  fail(PHOTO_BUCKET, error)
}

/**
 * A guest's chat moving to the account: the previews of its photos (a guest keeps no other) go to Storage, the
 * messages at once. A photo that fails keeps its preview in the message, so it is still shown.
 */
export async function moveGuestPhotos(client: Client, userId: string, chat: Chat): Promise<Chat> {
  const messages = await Promise.all(
    chat.messages.map(async (message) => {
      const attachments = message.data.attachments
      const previews = attachments?.map((a) => a.preview)
      if (!attachments || attachments.some((a) => a.path) || !previews?.every(Boolean)) return message
      try {
        const uploaded = await uploadPhotos(client, userId, chat.id, message, previews as string[])
        return { ...message, data: { ...message.data, attachments: uploaded } }
      } catch (error) {
        console.warn(`chats: photos not moved (${error instanceof Error ? error.message.slice(0, 200) : 'error'})`)
        return message
      }
    }),
  )
  return { ...chat, messages }
}
