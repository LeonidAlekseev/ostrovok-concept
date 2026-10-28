import type { Database } from './db/database.types'
import { parseToolRun, type ToolRun } from './toolResult'

/**
 * The chats with the hotels' owners (supabase/migrations/20261028130000_hotelier_chat.sql): a traveller's chat with a
 * hotel (`user`) and Эвал's questions to its hotelier on a traveller's behalf (`ai_request`). Their messages are the
 * traveller's, the hotelier's or the hotel's AI assistant's. The browser reads them under RLS and follows them by
 * Realtime (src/lib/hotelierChatRemote.ts); the routes of src/app/api/hotels/[hotelId]/hotelier and src/app/api/hotelier
 * write them. A message is untrusted text: shown as it is, never instructions for a model. The hotelier never sees who
 * the traveller is: «Гость».
 */

type Tables = Database['public']['Tables']
export type ConversationRow = Tables['hotelier_conversations']['Row']
export type MessageRow = Tables['hotelier_messages']['Row']
export type RequestRow = Tables['hotelier_requests']['Row']

export const HOTELIER_SENDERS = ['user', 'hotelier', 'ai_assistant'] as const
export type HotelierSender = (typeof HOTELIER_SENDERS)[number]

export const CONVERSATION_STATUSES = ['open', 'waiting_hotelier', 'resolved', 'closed'] as const
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number]

export const CONVERSATION_KINDS = ['user', 'ai_request'] as const
export type ConversationKind = (typeof CONVERSATION_KINDS)[number]

export const REQUEST_STATUSES = ['pending', 'answered', 'cancelled', 'expired'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

/** A message's length at most, as the table allows it is 4000; a chat's message is shorter. */
export const MAX_HOTELIER_MESSAGE = 2000

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  open: 'Открыто',
  waiting_hotelier: 'Ждёт отельера',
  resolved: 'Решено',
  closed: 'Закрыто',
}

export const KIND_LABEL: Record<ConversationKind, string> = { user: 'Пользователь', ai_request: 'Эвал' }

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Ждёт ответа',
  answered: 'Отвечен',
  cancelled: 'Отменён',
  expired: 'Истёк',
}

/** Who wrote, as each side sees it: the traveller is «Гость» for the hotelier, the hotelier is «Отельер». */
export const senderLabel = (sender: HotelierSender, viewer: 'user' | 'hotelier') =>
  sender === 'ai_assistant'
    ? 'AI-помощник отеля'
    : sender === 'hotelier'
      ? viewer === 'hotelier'
        ? 'Вы'
        : 'Отельер'
      : viewer === 'user'
        ? 'Вы'
        : 'Гость'

export interface HotelierConversation {
  id: string
  hotelId: string
  /** The hotel's name, when the list read it. */
  hotelName: string | null
  kind: ConversationKind
  status: ConversationStatus
  lastMessageAt: string
  lastMessageText: string
  lastSender: HotelierSender | null
  userUnread: number
  hotelierUnread: number
  /** Demonstration: the demo hotelier answers, or the demo data made it. */
  demo: boolean
  createdAt: string
}

export interface HotelierMessage {
  id: string
  conversationId: string
  sender: HotelierSender
  text: string
  requestId: string | null
  shareable: boolean
  /** The hotelier withdrew the answer's knowledge. */
  knowledgeRevokedAt: string | null
  /** Demonstration: the demo hotelier's answer or a message of the demo data, marked «демо». */
  demo: boolean
  readAt: string | null
  createdAt: string
  /** The AI assistant's answer: the sources it used, from the store. */
  run?: ToolRun
}

export interface HotelierRequest {
  id: string
  conversationId: string
  hotelId: string
  question: string
  characteristicKeys: string[]
  contextSummary: string | null
  status: RequestStatus
  /** The answer's characteristics: `queued` on the way, `done`, `failed` (re-run), `none` before an answer. */
  knowledgeStatus: 'none' | 'queued' | 'done' | 'failed'
  answeredAt: string | null
  createdAt: string
}

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  values.includes(value as T) ? (value as T) : fallback

/** The hotel's name of a row read with `hotel:hotels(name:data->>name)`. */
const hotelNameOf = (row: unknown): string | null => {
  const hotel = (row as { hotel?: { name?: unknown } | null }).hotel
  return typeof hotel?.name === 'string' && hotel.name ? hotel.name : null
}

export const conversationOf = (row: ConversationRow): HotelierConversation => ({
  id: row.id,
  hotelId: row.hotel_id,
  hotelName: hotelNameOf(row),
  kind: oneOf(CONVERSATION_KINDS, row.kind, 'user'),
  status: oneOf(CONVERSATION_STATUSES, row.status, 'open'),
  lastMessageAt: row.last_message_at,
  lastMessageText: row.last_message_text,
  lastSender: row.last_sender ? oneOf(HOTELIER_SENDERS, row.last_sender, 'user') : null,
  userUnread: row.user_unread,
  hotelierUnread: row.hotelier_unread,
  demo: row.is_demo === true,
  createdAt: row.created_at,
})

export function messageOf(row: MessageRow): HotelierMessage {
  const sender = oneOf(HOTELIER_SENDERS, row.sender, 'user')
  // Only the assistant's message carries a run: the people's never do.
  const run = sender === 'ai_assistant' ? parseToolRun((row.data as { run?: unknown } | null)?.run) : undefined
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sender,
    text: row.text,
    requestId: row.request_id,
    shareable: row.shareable,
    knowledgeRevokedAt: row.knowledge_revoked_at ?? null,
    demo: row.is_demo === true,
    readAt: row.read_at,
    createdAt: row.created_at,
    ...(run && { run }),
  }
}

export const requestOf = (row: RequestRow): HotelierRequest => ({
  id: row.id,
  conversationId: row.conversation_id,
  hotelId: row.hotel_id,
  question: row.question,
  characteristicKeys: row.characteristic_keys,
  contextSummary: row.context_summary,
  status: oneOf(REQUEST_STATUSES, row.status, 'pending'),
  knowledgeStatus: oneOf(['none', 'queued', 'done', 'failed'] as const, row.knowledge_status, 'none'),
  answeredAt: row.answered_at,
  createdAt: row.created_at,
})

/** The feed in time order, each message once: a Realtime event may bring one the feed already has. */
export function addMessage(messages: readonly HotelierMessage[], message: HotelierMessage): HotelierMessage[] {
  const rest = messages.filter((m) => m.id !== message.id)
  return [...rest, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

/** The list newest first, the changed conversation in place of its old row. */
export function putConversation(
  list: readonly HotelierConversation[],
  conversation: HotelierConversation,
): HotelierConversation[] {
  const old = list.find((c) => c.id === conversation.id)
  // A Realtime row has no joined hotel: it keeps the name the list read.
  const next = { ...conversation, hotelName: conversation.hotelName ?? old?.hotelName ?? null }
  return [...list.filter((c) => c.id !== conversation.id), next].sort((a, b) =>
    b.lastMessageAt.localeCompare(a.lastMessageAt),
  )
}

export interface InboxFilter {
  status?: ConversationStatus
  kind?: ConversationKind
  hotelId?: string
}

export const matchesFilter = (conversation: HotelierConversation, { status, kind, hotelId }: InboxFilter) =>
  (!status || conversation.status === status) &&
  (!kind || conversation.kind === kind) &&
  (!hotelId || conversation.hotelId === hotelId)
