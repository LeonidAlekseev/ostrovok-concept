import {
  MAX_PHOTOS,
  PHOTO_TEXT,
  stepTitle,
  type AssistantRequest,
  type Brief,
  type Plan,
  type Question,
  type TurnStep,
} from './assistant'
import { clearDialog, isBrief, isPlan, isQuestion, loadDialog } from './assistantDialog'
import { parseChatMap, type ChatMap } from './geo/chatMap'
import { parseChatWidget, type ChatWidget } from './chatWidget'
import { parseParams, type SessionParam } from './sessionMemory'
import { requestStage, requestViewOf } from './hotelierRequest'
import { parseToolRun, type ToolRun } from './toolResult'
import { parseDateChange, type DateChange, type DateChangeState } from './trips'

/**
 * The chats with Эвал. A message has a role, a status and structured data, so the feed holds the steps of Эвал's
 * agents next to its answers, and a hotel owner's answers later (`owner`). A pending message is finished later —
 * after a reload, or while the traveller is in another chat. A guest keeps the chats in localStorage; a signed-in
 * user in Supabase (`assistant_chats`, `assistant_messages`: src/lib/assistantChatsRemote.ts), where a guest's chats
 * move on sign-in.
 */

export type MessageRole = 'user' | 'assistant' | 'agent' | 'owner'
export type MessageStatus = 'pending' | 'done' | 'failed'

/** A step of one of Эвал's agents: who, what it does, what came of it. */
export interface AgentStep {
  agent: TurnStep['agent'] | (string & {})
  title: string
  /** What it was called with, briefly in Russian. */
  params?: string
  result?: string
  /**
   * A tool of the contract (src/lib/toolResult.ts): its run with the sources and data, kept in the message so the
   * block opens after a reload and in a shared snapshot. An older step has none and shows as before.
   */
  run?: ToolRun
}

/**
 * A photo of the traveller's message, optimised in the browser (src/lib/imageOptimize.ts). A guest has only the
 * `preview`; a signed-in user's photo is in Storage (`path`, shown by a signed link) and the preview stays in memory
 * only; a shared snapshot's photo has its public `url`. A photo with none of them (the guest's storage overflowed)
 * reads «Фото».
 */
export interface Attachment {
  /** `<user_id>/<chat_id>/<message_id>/<n>.webp` in the private bucket `assistant-attachments`. */
  path?: string
  /** A data URL of 320 px. */
  preview?: string
  /** The public link of the copy in a shared snapshot (`assistant-shared-attachments`). */
  url?: string
  width: number
  height: number
}

export interface MessageData {
  /** The traveller's photos. */
  attachments?: Attachment[]
  plan?: Plan
  step?: AgentStep
  /** The traveller's «Другие варианты»: the answer skips the hotels the chat has shown. */
  more?: true
  /** A chat about a hotel: the model's part of the answer from general knowledge, shown marked «Не проверено». */
  unverified?: string
  /** A chat about a hotel: the places near it and the routes to them the geo steps found. */
  map?: ChatMap
  /** A chat about a hotel: the noise map or the map of the view the answer is about. */
  widget?: ChatWidget
  /** «Сохранил в память сессии»: what a change of the chat's brief saved (an agent's message). */
  memory?: SessionParam[]
  /**
   * «Пока не нашёл точных совпадений»: the brief the search went by, its parameters shown to be changed (the newest
   * such answer only).
   */
  notFound?: Brief
  /** An answer to the parameters changed by hand: the route picks by the brief, the dialog is not read again. */
  rerun?: true
  /**
   * A chat about the bookings: the change of a booking's dates Эвал proposed and what came of it — applied in the
   * browser only with «Подтвердить».
   */
  change?: { proposal: DateChange; state: DateChangeState }
  /** The demo hotelier's answer or a message of the demo data: shown marked «демо». */
  demo?: true
  /** An `owner` message written by the hotel's AI assistant, not the hotelier in person: shown marked as such. */
  hotelAi?: true
}

export interface ChatMessage {
  id: string
  role: MessageRole
  status: MessageStatus
  text: string
  data: MessageData
  /** ISO timestamp: the order of the feed. */
  createdAt: string
}

export interface Chat {
  id: string
  /** The first words of the traveller; empty until the first message. */
  title: string
  brief: Brief
  question: Question | null
  /** An answer came while the traveller was in another chat. */
  unread: boolean
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

export const CHATS_KEY = 'ostrovok:v1:assistant-chats'
/** The guest's oldest chats beyond this are dropped. */
export const MAX_GUEST_CHATS = 30
const TITLE_LENGTH = 60

export const newId = (): string => crypto.randomUUID()

export function newChat(now = new Date().toISOString()): Chat {
  return {
    id: newId(),
    title: '',
    brief: {},
    question: null,
    unread: false,
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
}

/** «Тихий отель в Валенсии, чтобы ночью…» */
export function chatTitle(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : line
}

/**
 * A message still waits for its answer. A pending step of an agent alone is no wait: it is the turn's sign of work,
 * and the turn that left it has finished (a step orphaned by a lost write must not block the chat for good).
 */
export const isPending = (chat: Chat) => chat.messages.some((m) => m.status === 'pending' && m.role !== 'agent')

/** The hotels the chat's answers have shown. */
export const shownHotels = (chat: Chat): Set<string> =>
  new Set(chat.messages.flatMap((m) => m.data.plan?.options.flatMap((o) => (o.hotel ? [o.hotel.id] : [])) ?? []))

/**
 * The newest chat about the bookings the trips page continues: the one opened on the booking `bookingId`, or the one of
 * all the trips without it.
 */
export const tripsChatOf = (chats: readonly Chat[], bookingId?: string): Chat | undefined =>
  chats.filter((c) => c.brief.trips && c.brief.bookingId === bookingId && c.messages.length > 0).sort(byRecent)[0]

/** The newest chat about the hotel (`brief.hotelId`), the one its page continues. */
export const hotelChatOf = (chats: readonly Chat[], hotelId: string): Chat | undefined =>
  chats.filter((c) => c.brief.hotelId === hotelId && c.messages.length > 0).sort(byRecent)[0]

/** The newest chat first. */
export const byRecent = (a: Chat, b: Chat) => b.updatedAt.localeCompare(a.updatedAt)

/**
 * The dialog the model reads: the traveller's messages and Эвал's answers, without the steps of agents, the failed
 * and the pending ones; a plan without words has no text and is skipped by the client.
 */
export const dialogOf = (chat: Chat): AssistantRequest['messages'] =>
  chat.messages
    .filter((m) => m.status === 'done' && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      // A message of photos only still says something: the route reads «Фото».
      text: m.text || (m.data.attachments?.length ? PHOTO_TEXT : ''),
    }))

/** The traveller's newest message with photos. */
export const lastPhotoMessage = (chat: Chat): ChatMessage | undefined =>
  chat.messages.findLast((m) => m.role === 'user' && (m.data.attachments?.length ?? 0) > 0)

// ---------------------------------------------------------------------------------------------
// Validation: the guest's storage and the rows of Supabase are untrusted.

type Shape = Record<string, unknown>
const isObject = (value: unknown): value is Shape =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const ROLES: readonly MessageRole[] = ['user', 'assistant', 'agent', 'owner']
const STATUSES: readonly MessageStatus[] = ['pending', 'done', 'failed']

const isStep = (value: unknown): value is AgentStep =>
  isObject(value) &&
  isString(value.agent) &&
  isString(value.title) &&
  (value.params === undefined || isString(value.params)) &&
  (value.result === undefined || isString(value.result))

/** The known parts of a step; a run off the contract is dropped and the step shows as an older one. */
function stepOf(value: AgentStep): AgentStep {
  const run = parseToolRun(value.run)
  return {
    agent: value.agent,
    title: stepTitle(value.agent, value.title),
    ...(value.params !== undefined && { params: value.params }),
    ...(value.result !== undefined && { result: value.result }),
    ...(run && { run }),
  }
}

const isSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 10_000
/** The only pictures a message shows: its own data URL and the links of Supabase Storage. */
const PREVIEW = /^data:image\/(?:webp|jpeg|png);base64,/
const LINK = /^https?:\/\//
const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/\d+\.(?:webp|jpg)$/i

/** The photo's known parts; one without a valid size reads as none. */
function parseAttachment(value: unknown): Attachment | null {
  if (!isObject(value) || !isSize(value.width) || !isSize(value.height)) return null
  return {
    ...(isString(value.path) && PATH.test(value.path) && { path: value.path }),
    ...(isString(value.preview) && PREVIEW.test(value.preview) && { preview: value.preview }),
    ...(isString(value.url) && LINK.test(value.url) && { url: value.url }),
    width: value.width,
    height: value.height,
  }
}

/** The known parts of a message's data; a plan of an older version loses its ready-made route. */
export function parseData(value: unknown): MessageData | null {
  if (!isObject(value)) return null
  if (value.plan !== undefined && !isPlan(value.plan)) return null
  if (value.step !== undefined && !isStep(value.step)) return null
  const attachments = Array.isArray(value.attachments)
    ? value.attachments.slice(0, MAX_PHOTOS).flatMap((a) => parseAttachment(a) ?? [])
    : []
  return {
    ...(attachments.length > 0 && { attachments }),
    ...(value.plan !== undefined && { plan: value.plan as Plan }),
    ...(value.step !== undefined && { step: stepOf(value.step as AgentStep) }),
    ...(value.more === true && { more: true as const }),
    ...(isString(value.unverified) && value.unverified && { unverified: value.unverified }),
    ...(parseChatMap(value.map) && { map: parseChatMap(value.map) }),
    ...(parseChatWidget(value.widget) && { widget: parseChatWidget(value.widget) }),
    ...(parseParams(value.memory) && { memory: parseParams(value.memory) }),
    ...(isBrief(value.notFound) && { notFound: value.notFound }),
    ...(value.rerun === true && { rerun: true as const }),
    ...(parseChange(value.change) && { change: parseChange(value.change) }),
    ...(value.demo === true && { demo: true as const }),
    ...(value.hotelAi === true && { hotelAi: true as const }),
  }
}

const CHANGE_STATES: readonly DateChangeState[] = ['proposed', 'applied', 'outdated']

function parseChange(value: unknown): MessageData['change'] {
  if (!isObject(value) || !CHANGE_STATES.includes(value.state as DateChangeState)) return undefined
  const proposal = parseDateChange(value.proposal)
  return proposal && { proposal, state: value.state as DateChangeState }
}

export function parseMessage(value: unknown): ChatMessage | null {
  if (!isObject(value) || !isString(value.id) || !isString(value.text) || !isString(value.createdAt)) return null
  if (!ROLES.includes(value.role as MessageRole) || !STATUSES.includes(value.status as MessageStatus)) return null
  const data = parseData(value.data ?? {})
  if (!data) return null
  return {
    id: value.id,
    role: value.role as MessageRole,
    status: value.status as MessageStatus,
    text: value.text,
    data,
    createdAt: value.createdAt,
  }
}

/** How far the step's «Запрос отельеру» has gone (`requestStage`); -1 for a step of another tool or none. */
const stageOf = (message: ChatMessage) => {
  const run = message.data.step?.run
  return run ? requestStage(requestViewOf(run.result)) : -1
}

/**
 * A message the server wrote into the chat later, by Realtime: the hotelier's answer (`owner`) joins the feed, and the
 * step of «Запрос отельеру» takes its run once it has gone further — answered, its characteristics in, or withdrawn by
 * the hotelier. Anything else — an echo of the browser's own save, which may be older than what the browser has —
 * leaves the chat as it is (the same object). `active`: the traveller
 * is in this chat, so a new answer is not unread.
 */
export function mergeServerMessage(chat: Chat, message: ChatMessage, active: boolean): Chat {
  const old = chat.messages.find((m) => m.id === message.id)
  if (!old) {
    if (message.role !== 'owner') return chat
    const messages = [...chat.messages, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return { ...chat, messages, unread: chat.unread || !active, updatedAt: message.createdAt }
  }
  if (stageOf(message) <= stageOf(old)) return chat
  return { ...chat, messages: chat.messages.map((m) => (m.id === message.id ? { ...m, data: message.data } : m)) }
}

export function parseChat(value: unknown): Chat | null {
  if (!isObject(value) || !isString(value.id) || !isString(value.title)) return null
  if (!isString(value.createdAt) || !isString(value.updatedAt) || !isBrief(value.brief)) return null
  if (value.question !== null && !isQuestion(value.question)) return null
  if (!Array.isArray(value.messages)) return null
  const messages = value.messages.map(parseMessage)
  if (messages.some((m) => m === null)) return null
  const waits = (messages as ChatMessage[]).some((m) => m.status === 'pending' && m.role !== 'agent')
  return {
    id: value.id,
    title: value.title,
    brief: value.brief,
    question: value.question as Question | null,
    unread: value.unread === true,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    // The steps no turn waits for any more (the answer is done) are failed ones.
    messages: (messages as ChatMessage[]).map((m) =>
      !waits && m.role === 'agent' && m.status === 'pending' ? { ...m, status: 'failed' as const } : m,
    ),
  }
}

/** The chats that read; a damaged one is skipped, a damaged list reads as none. */
export function parseChats(value: unknown): Chat[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((chat) => parseChat(chat) ?? [])
}

// ---------------------------------------------------------------------------------------------
// The guest's chats in localStorage

/** The dialog of the older versions (sessionStorage) as a chat. */
function legacyChat(): Chat | null {
  const dialog = loadDialog()
  if (!dialog) return null
  const now = new Date().toISOString()
  const chat = newChat(now)
  chat.brief = dialog.brief
  chat.question = dialog.question
  chat.title = chatTitle(dialog.messages.find((m) => m.from === 'user')?.text ?? '')
  // The order of the feed: a millisecond a message, before now.
  const start = Date.parse(now) - dialog.messages.length
  chat.messages = dialog.messages.map((m, i) => ({
    id: newId(),
    role: m.from === 'user' ? 'user' : 'assistant',
    status: 'done',
    text: m.text,
    data: m.plan ? { plan: m.plan } : {},
    createdAt: new Date(start + i).toISOString(),
  }))
  return chat
}

/**
 * The guest's chats, newest first, with the dialog of an older version moved in (and erased there). Empty when
 * the storage is unavailable or damaged.
 */
export function loadGuestChats(): Chat[] {
  let chats: Chat[] = []
  try {
    const raw = window.localStorage.getItem(CHATS_KEY)
    chats = raw === null ? [] : parseChats(JSON.parse(raw))
  } catch {
    chats = []
  }
  const legacy = legacyChat()
  if (legacy) {
    chats = [legacy, ...chats]
    saveGuestChats(chats)
    clearDialog()
  }
  return chats.sort(byRecent)
}

/** The photo without its preview: in Storage it is shown by its link, otherwise it reads «Фото». */
export const withoutPreview = ({ path, url, width, height }: Attachment): Attachment => ({
  ...(path && { path }),
  ...(url && { url }),
  width,
  height,
})

/** The chat without the previews of its photos: the messages keep «Фото». */
const withoutPreviews = (chat: Chat): Chat => ({
  ...chat,
  messages: chat.messages.map((m) =>
    m.data.attachments ? { ...m, data: { ...m.data, attachments: m.data.attachments.map(withoutPreview) } } : m,
  ),
})
const hasPreviews = (chat: Chat) => chat.messages.some((m) => m.data.attachments?.some((a) => a.preview))

/**
 * Saves the guest's chats with messages, the newest `MAX_GUEST_CHATS`; none erases the key. When the storage is
 * full, the previews of the oldest chats go first, one chat at a time.
 */
export function saveGuestChats(chats: readonly Chat[]) {
  try {
    let kept = chats
      .filter((c) => c.messages.length > 0)
      .sort(byRecent)
      .slice(0, MAX_GUEST_CHATS)
    if (kept.length === 0) return window.localStorage.removeItem(CHATS_KEY)
    for (;;) {
      try {
        return window.localStorage.setItem(CHATS_KEY, JSON.stringify(kept))
      } catch (error) {
        const oldest = kept.findLastIndex(hasPreviews)
        if (oldest < 0) throw error
        kept = kept.map((chat, i) => (i === oldest ? withoutPreviews(chat) : chat))
      }
    }
  } catch {
    // Storage is full or disabled: the chats live in memory only.
  }
}
