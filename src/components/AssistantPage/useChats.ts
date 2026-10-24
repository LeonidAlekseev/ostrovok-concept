import { useCallback, useEffect, useRef, useState } from 'react'
import type { Destination } from '@/data/destinations'
import { useSession } from '@/hooks/useStore'
import {
  askAssistant,
  describeBrief,
  makePlan,
  mergeBrief,
  missingNote,
  nextQuestion,
  planCities,
  type AssistantResponse,
  type Brief,
  type Question,
} from '@/lib/assistant'
import {
  chatTitle,
  dialogOf,
  loadGuestChats,
  newChat,
  newId,
  saveGuestChats,
  shownHotels,
  type Chat,
  type ChatMessage,
} from '@/lib/assistantChats'
import { deleteRemoteChat, deleteRemoteMessages, loadRemoteChats, saveRemoteChat } from '@/lib/assistantChatsRemote'
import type { HotelSummary } from '@/lib/catalog'
import { todayIso } from '@/lib/dates'
import { getBrowserClient } from '@/lib/supabase/client'

/** The shortest pause before the assistant replies, so the answer reads as a reply rather than an echo. */
export const THINK_MS = 650

/** Where the chats live: not known yet, the browser (a guest) or Supabase (a signed-in user). */
type Mode = { kind: 'loading' } | { kind: 'guest' } | { kind: 'remote'; email: string }

const later = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString()
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The first step the turn will show, while the answer is on its way: only when the plan is surely due. */
const SEARCH_STEP = { agent: 'search', title: 'Подбираю отели по вашему описанию' } as const

/** Eval's answer: the next question with what it has understood, or the plan once nothing is left to ask. */
export function compose(
  response: AssistantResponse,
  destinations: readonly Destination[],
  newHotels: readonly HotelSummary[],
  /** The hotels the chat has shown, for «Другие варианты». */
  exclude?: ReadonlySet<string>,
): { brief: Brief; question: Question | null; text: string; data: ChatMessage['data'] } {
  const { brief, reply: remark, matches, features, missing = [] } = response
  const today = todayIso()
  const question = nextQuestion(brief, today, destinations)
  const understood = describeBrief(brief, destinations)
  if (question) {
    // The model's remark fills in only when nothing is understood yet, so answers keep "Записал: …".
    const lead = understood ? `Записал: ${understood}.` : remark
    return { brief, question, text: lead ? `${lead} ${question.text}` : question.text, data: {} }
  }
  const plan = makePlan(brief, today, destinations, newHotels, matches, features, exclude)
  const note = missingNote(missing, planCities(brief, today, destinations))
  const text = [understood && `Записал: ${understood}.`, note].filter(Boolean).join(' ')
  return { brief, question, text, data: { plan } }
}

export interface Chats {
  /** Newest first. */
  chats: Chat[]
  /** The open chat; a new one is not in the list until its first message. */
  active: Chat
  ready: boolean
  /** Signed in: the chats live in Supabase and can be shared. */
  signedIn: boolean
  /** Sends the traveller's text in the open chat; `more` asks for the hotels the chat has not shown yet. */
  send: (text: string, options?: { more?: boolean }) => void
  /** Asks the failed answer again. */
  retry: (chatId: string, messageId: string) => void
  rename: (chatId: string, title: string) => void
  /** Deletes the chat with its messages, here and in the account. */
  remove: (chatId: string) => void
  /** The trip's parameters edited by hand: the next answer goes by them. */
  setBrief: (chatId: string, brief: Brief) => void
}

/**
 * The traveller's chats with Эвал. Each one is independent: an answer comes to its own chat, marked unread if the
 * traveller is in another one, and a pending answer is asked again after a reload. A guest keeps the chats in the
 * browser; on sign-in they move to the account (Supabase) and the account's chats are shown.
 */
export function useChats(
  destinations: readonly Destination[],
  newHotels: readonly HotelSummary[],
  /** The chat of the address (`/assistant/<id>`); `null` or an id not in the list is a new, empty chat. */
  activeId: string | null,
): Chats {
  const session = useSession()
  const [mode, setMode] = useState<Mode>({ kind: 'loading' })
  const [chats, setChats] = useState<Chat[]>([])
  const [draft, setDraft] = useState<Chat>(() => newChat())

  // The latest values for the turns that finish later.
  const chatsRef = useRef(chats)
  const activeRef = useRef(activeId)
  const modeRef = useRef(mode)
  const inflight = useRef(new Map<string, AbortController>())
  /** What Supabase already has of each chat, to write only the changed ones. */
  const saved = useRef(new Map<string, Chat>())
  const queue = useRef(Promise.resolve())

  useEffect(() => {
    chatsRef.current = chats
    activeRef.current = activeId
    modeRef.current = mode
  })

  // Signed in or not: the session of Supabase, then its changes (sign-in, sign-out) through the session store.
  const email = session?.email ?? null
  useEffect(() => {
    let cancelled = false
    const guestMode = () => {
      saved.current.clear()
      setChats(loadGuestChats())
      setMode({ kind: 'guest' })
    }
    async function settle(client: NonNullable<ReturnType<typeof getBrowserClient>>) {
      const { data } = await client.auth.getSession()
      const user = data.session?.user
      if (cancelled) return
      if (!user) return guestMode()
      // The guest's chats move to the account, then leave the browser.
      const guest = loadGuestChats()
      try {
        for (const chat of guest) await saveRemoteChat(client, chat)
        if (guest.length) saveGuestChats([])
        const remote = await loadRemoteChats(client)
        if (cancelled) return
        saved.current = new Map(remote.map((c) => [c.id, c]))
        setChats(remote)
      } catch (error) {
        // The account's chats are unreachable: the browser's stay, the next change tries to save them again.
        console.warn(`chats: ${error instanceof Error ? error.message.slice(0, 200) : 'unavailable'}`)
        if (cancelled) return
        setChats(guest)
      }
      setMode({ kind: 'remote', email: user.email ?? '' })
    }
    // Without Supabase every visitor is a guest, from the first render on.
    const client = getBrowserClient()
    if (client) void settle(client)
    // oxlint-disable-next-line react/set-state-in-effect -- the chats live in the browser's storage
    else guestMode()
    return () => {
      cancelled = true
    }
  }, [email])

  useEffect(() => {
    const pending = inflight.current
    // The pending answers stay pending and are asked again on the next visit (or the next mount).
    return () => {
      pending.forEach((controller) => controller.abort())
      pending.clear()
    }
  }, [])

  // Saves what changed: the whole list for a guest, the changed chats for a signed-in user, in order.
  useEffect(() => {
    if (mode.kind === 'guest') saveGuestChats(chats)
    if (mode.kind !== 'remote') return
    const client = getBrowserClient()
    if (!client) return
    for (const chat of chats) {
      const before = saved.current.get(chat.id)
      if (before === chat || chat.messages.length === 0) continue
      const ids = new Set(chat.messages.map((m) => m.id))
      const gone = (before?.messages ?? []).filter((m) => !ids.has(m.id)).map((m) => m.id)
      queue.current = queue.current
        .then(async () => {
          await saveRemoteChat(client, chat)
          await deleteRemoteMessages(client, gone)
          if (saved.current.get(chat.id) === before) saved.current.set(chat.id, chat)
        })
        .catch((error: unknown) => {
          console.warn(`chats: not saved (${error instanceof Error ? error.message.slice(0, 200) : 'error'})`)
        })
    }
  }, [chats, mode])

  const update = useCallback((chatId: string, change: (chat: Chat) => Chat) => {
    setChats((list) => list.map((chat) => (chat.id === chatId ? change(chat) : chat)))
  }, [])

  /** Eval's answer to the chat's pending message: its steps, then the text and the plan. */
  const runTurn = useCallback(
    async (chatId: string, pendingId: string) => {
      if (inflight.current.has(chatId)) return
      const chat = chatsRef.current.find((c) => c.id === chatId)
      const pending = chat?.messages.find((m) => m.id === pendingId)
      if (!chat || !pending || pending.status !== 'pending') return
      const controller = new AbortController()
      inflight.current.set(chatId, controller)

      const history = dialogOf({ ...chat, messages: chat.messages.filter((m) => m.createdAt < pending.createdAt) })
      const input = history.at(-1)?.text ?? ''
      const asked = chat.question?.id ?? null
      const today = todayIso()
      // The plan is surely due when the rules alone complete the brief: its first step shows while Эвал works.
      const planDue = !nextQuestion(mergeBrief(chat.brief, input, asked, destinations), today)
      const stepId = newId()
      update(chatId, (c) => ({
        ...c,
        messages: [
          // Steps left pending by an earlier visit go: the turn shows its own.
          ...c.messages.filter((m) => !(m.role === 'agent' && m.status === 'pending')),
          ...(planDue
            ? [
                {
                  id: stepId,
                  role: 'agent',
                  status: 'pending',
                  text: '',
                  data: { step: SEARCH_STEP },
                  createdAt: later(pending.createdAt, -1),
                } satisfies ChatMessage,
              ]
            : []),
        ].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      }))

      try {
        const [response] = await Promise.all([
          askAssistant({ messages: history, brief: chat.brief }, asked, destinations, controller.signal),
          delay(THINK_MS),
        ])
        if (controller.signal.aborted) return
        finish(chatId, pendingId, response)
      } catch {
        if (controller.signal.aborted) return
        update(chatId, (c) => ({
          ...c,
          messages: c.messages
            .filter((m) => !(m.role === 'agent' && m.status === 'pending'))
            .map((m) => (m.id === pendingId ? { ...m, status: 'failed', text: 'Не получилось ответить.' } : m)),
        }))
      } finally {
        if (inflight.current.get(chatId) === controller) inflight.current.delete(chatId)
      }
    },
    // `finish` reads only refs and stable callbacks.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [destinations, newHotels, update],
  )

  function finish(chatId: string, pendingId: string, response: AssistantResponse) {
    // «Другие варианты» skips the hotels the chat has shown before.
    const chat = chatsRef.current.find((c) => c.id === chatId)
    const pendingAt = chat?.messages.find((m) => m.id === pendingId)?.createdAt ?? ''
    const asked = chat?.messages.findLast((m) => m.role === 'user' && m.createdAt < pendingAt)
    const exclude = chat && asked?.data.more ? shownHotels(chat) : undefined
    // Composed before the update: a failure here fails the answer, not the render.
    const { brief: next, question, text, data } = compose(response, destinations, newHotels, exclude)
    const steps = response.steps ?? []
    const now = new Date().toISOString()
    update(chatId, (chat) => {
      const pending = chat.messages.find((m) => m.id === pendingId)
      if (!pending) return chat
      // The turn's steps go right before the answer, in their order.
      const stepMessages: ChatMessage[] = steps.map((step, i) => ({
        id: newId(),
        role: 'agent',
        status: step.status,
        text: '',
        data: { step: { agent: step.agent, title: step.title, ...(step.result && { result: step.result }) } },
        createdAt: later(pending.createdAt, i - steps.length),
      }))
      const messages = [
        ...chat.messages.filter((m) => !(m.role === 'agent' && m.status === 'pending')),
        ...stepMessages,
      ]
        .map((m) => (m.id === pendingId ? { ...m, status: 'done' as const, text, data } : m))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      return { ...chat, brief: next, question, messages, unread: activeRef.current !== chatId, updatedAt: now }
    })
  }

  // A pending answer of an earlier visit (a reload, another tab) is asked again.
  useEffect(() => {
    if (mode.kind === 'loading') return
    for (const chat of chats) {
      const pending = chat.messages.find((m) => m.role === 'assistant' && m.status === 'pending')
      if (pending && !inflight.current.has(chat.id)) void runTurn(chat.id, pending.id)
    }
  }, [chats, mode, runTurn])

  // An address of a chat not in the list (a new one, or one deleted elsewhere) opens an empty chat of that id.
  const listed = chats.find((c) => c.id === activeId)
  const active = listed ?? (activeId && draft.id !== activeId ? { ...draft, id: activeId } : draft)

  // The open chat is read.
  useEffect(() => {
    if (!listed?.unread) return
    // oxlint-disable-next-line react/set-state-in-effect -- the mark follows the chat the address opens
    update(listed.id, (chat) => ({ ...chat, unread: false }))
  }, [listed, update])

  const send = (raw: string, options: { more?: boolean } = {}) => {
    const text = raw.trim()
    if (!text || active.messages.some((m) => m.status === 'pending')) return
    const now = new Date().toISOString()
    const user: ChatMessage = {
      id: newId(),
      role: 'user',
      status: 'done',
      text,
      data: options.more ? { more: true } : {},
      createdAt: now,
    }
    const pending: ChatMessage = {
      id: newId(),
      role: 'assistant',
      status: 'pending',
      text: '',
      data: {},
      createdAt: later(now, 2),
    }
    const chat: Chat = {
      ...active,
      title: active.title || chatTitle(text),
      messages: [...active.messages, user, pending],
      unread: false,
      updatedAt: now,
    }
    setChats((list) => [chat, ...list.filter((c) => c.id !== chat.id)])
    if (!listed) setDraft(newChat())
    // The turn starts from the effect above, once the chat is in the list.
  }

  const retry = (chatId: string, messageId: string) =>
    update(chatId, (chat) => ({
      ...chat,
      messages: chat.messages.map((m) => (m.id === messageId ? { ...m, status: 'pending', text: '' } : m)),
    }))

  const rename = (chatId: string, raw: string) => {
    const title = chatTitle(raw)
    if (title) update(chatId, (chat) => ({ ...chat, title }))
  }

  const remove = (chatId: string) => {
    inflight.current.get(chatId)?.abort()
    inflight.current.delete(chatId)
    setChats((list) => list.filter((c) => c.id !== chatId))
    if (modeRef.current.kind !== 'remote') return
    const client = getBrowserClient()
    if (!client) return
    saved.current.delete(chatId)
    queue.current = queue.current
      .then(() => deleteRemoteChat(client, chatId))
      .catch((error: unknown) => {
        console.warn(`chats: not deleted (${error instanceof Error ? error.message.slice(0, 200) : 'error'})`)
      })
  }

  const setBrief = (chatId: string, brief: Brief) => {
    // The question asked follows the new brief: the answer of a date question is given by the dates set.
    const edit = (chat: Chat): Chat => ({
      ...chat,
      brief,
      question: chat.question && nextQuestion(brief, todayIso(), destinations),
    })
    if (listed?.id === chatId || chats.some((c) => c.id === chatId)) update(chatId, edit)
    else if (active.id === chatId) setDraft(edit({ ...active }))
  }

  return {
    chats,
    active,
    ready: mode.kind !== 'loading',
    signedIn: mode.kind === 'remote',
    send,
    retry,
    rename,
    remove,
    setBrief,
  }
}
