import { useCallback, useEffect, useRef, useState } from 'react'
import type { Destination } from '@/data/destinations'
import { useSession } from '@/hooks/useStore'
import {
  askAssistant,
  HOTEL_UNAVAILABLE,
  briefWithStay,
  makePlan,
  mergeBrief,
  MODELS_DOWN,
  missingNote,
  nextQuestion,
  NOT_FOUND,
  planCities,
  PHOTO_QUESTION,
  PHOTO_TEXT,
  PHOTO_LIMITED,
  PHOTO_MISSED,
  PHOTO_SKIPPED,
  PHOTO_UNSEEN,
  PHOTO_UNUSABLE,
  type AssistantResponse,
  type Brief,
  type Question,
  type StayDates,
} from '@/lib/assistant'
import {
  chatTitle,
  dialogOf,
  lastPhotoMessage,
  loadGuestChats,
  newChat,
  newId,
  saveGuestChats,
  shownHotels,
  type Chat,
  type ChatMessage,
} from '@/lib/assistantChats'
import {
  PHOTO_SAVE_ERROR,
  deleteRemoteChat,
  deleteRemoteMessages,
  deleteRemotePhotos,
  downloadPhotos,
  loadRemoteChats,
  moveGuestPhotos,
  photoPaths,
  saveRemoteChat,
  signedPhotoUrls,
  SIGNED_URL_REFRESH_MS,
  uploadPhotos,
} from '@/lib/assistantChatsRemote'
import type { PhotoUrl } from './ChatPhotos'
import { savedParams } from '@/lib/sessionMemory'
import type { HotelSummary } from '@/lib/catalog'
import { todayIso } from '@/lib/dates'
import { isHotelGeoQuestion, isHotelViewQuestion, isNoiseQuestion } from '@/lib/noise'
import type { OptimizedPhoto } from '@/lib/imageOptimize'
import { getBrowserClient } from '@/lib/supabase/client'
import { bookingsStore, findBooking, saveBooking } from '@/lib/storage'
import { MAX_BOOKINGS, applyDateChange, tripBooking } from '@/lib/trips'

/** The shortest pause before the assistant replies, so the answer reads as a reply rather than an echo. */
export const THINK_MS = 650

/** Where the chats live: not known yet, the browser (a guest) or Supabase (a signed-in user). */
type Mode = { kind: 'loading' } | { kind: 'guest' } | { kind: 'remote'; email: string; userId: string }

/** The answer's time after the traveller's message: the memory and the steps of the turn go between them. */
const ANSWER_GAP_MS = 50

const later = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString()
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const reason = (error: unknown) => (error instanceof Error ? error.message.slice(0, 200) : 'error')

/** The first step the turn will show, while the answer is on its way: only when the plan is surely due. */
const SEARCH_STEP = { agent: 'search', title: 'Подбираю отели по вашему описанию' } as const
/** The step shown while a question about the places near the hotel is answered: the geo steps come with the answer. */
const GEO_STEP = { agent: 'geo', title: 'Проверяю места рядом с отелем' } as const
const VIEW_STEP = { agent: 'geo', title: 'Проверяю, что видно из окна' } as const
/** The step of the tool «Анализ шума» while it runs: its block with the sources comes with the answer. */
const NOISE_STEP = { agent: 'features', title: 'Анализ шума' } as const
/** The step of a chat about the bookings while they are read: the blocks of its tools come with the answer. */
const TRIPS_STEP = { agent: 'trips', title: 'Смотрю бронирования' } as const
/** How long a turn of a signed-in user waits for its chat to be saved: the server records the tools' runs in it. */
const SAVE_WAIT_MS = 3000

/**
 * The steps of the answer in the feed: a step of a tool's run (`run.id`) already there is updated in place, so a run is
 * one block whatever comes of it; the others are added.
 */
export function mergeSteps(messages: readonly ChatMessage[], steps: readonly ChatMessage[]): ChatMessage[] {
  const byRun = new Map(steps.flatMap((m) => (m.data.step?.run ? [[m.data.step.run.id, m] as const] : [])))
  const kept = messages.map((m) => {
    const run = m.data.step?.run && byRun.get(m.data.step.run.id)
    return run ? { ...run, id: m.id, createdAt: m.createdAt } : m
  })
  const there = new Set(messages.flatMap((m) => m.data.step?.run?.id ?? []))
  return [...kept, ...steps.filter((m) => !(m.data.step?.run && there.has(m.data.step.run.id)))]
}

/** Eval's answer: the next question with what it has understood, or the plan once nothing is left to ask. */
export function compose(
  response: AssistantResponse,
  destinations: readonly Destination[],
  newHotels: readonly HotelSummary[],
  /** The hotels the chat has shown, for «Другие варианты». */
  exclude?: ReadonlySet<string>,
  /**
   * The chat's brief before the answer: what the answer saved is shown in a card of its own («Сохранил в память
   * сессии»), so the text does not repeat it.
   */
  before?: Brief,
): { brief: Brief; question: Question | null; text: string; data: ChatMessage['data'] } {
  const { brief, reply: remark, matches, features, missing = [], photo } = response
  const today = todayIso()
  // A chat about the bookings: the answer and the change of the dates it proposes, to be confirmed.
  if (brief.trips) {
    const { change } = response
    return {
      brief,
      question: null,
      text: remark ?? HOTEL_UNAVAILABLE,
      data: change ? { change: { proposal: change, state: 'proposed' } } : {},
    }
  }
  // A chat about a hotel: the answer is the text, the model's general knowledge goes apart; no questions, no plan.
  if (brief.hotelId) {
    const { unverified, map } = response
    return {
      brief,
      question: null,
      text: remark ?? HOTEL_UNAVAILABLE,
      data: { ...(unverified && { unverified }), ...(map && { map }) },
    }
  }
  // The photos: Эвал asks what to do with them, or says it could not look at them.
  if (photo?.action === 'ask') return { brief, question: PHOTO_QUESTION, text: PHOTO_QUESTION.text, data: {} }
  // No model that sees photos answered: the answer to the message's words, and Эвал says the photos went unseen.
  if (photo?.action === 'skipped') {
    const answer = compose({ ...response, photo: undefined }, destinations, newHotels, exclude, before)
    return { ...answer, text: `${PHOTO_SKIPPED} ${answer.text}`.trim() }
  }
  // The provider does not answer (every model of the chain failed) or the limit is over: Эвал says so honestly.
  if (photo?.action === 'unseen') return { brief, question: null, text: PHOTO_UNSEEN, data: {} }
  if (photo?.action === 'limited') return { brief, question: null, text: PHOTO_LIMITED, data: {} }
  const seen = photo?.seen ? `Вижу на фото: ${photo.seen.replace(/[.!]?$/, '.')}` : ''
  if (photo?.action === 'unusable') return { brief, question: null, text: `${seen} ${PHOTO_UNUSABLE}`.trim(), data: {} }
  if (photo?.action === 'similar') {
    if (photo.missed) return { brief, question: null, text: `${seen} ${PHOTO_MISSED}`.trim(), data: {} }
    if (!matches?.length)
      return {
        brief,
        question: null,
        text: `${seen} Похожих отелей по этому описанию не нашёл — опишите словами, что для вас важно.`.trim(),
        data: {},
      }
    // The hotels like the photo lead the plan, in the city of the best of them unless the chat has its own.
    const scope = { ...brief, destinationId: brief.destinationId ?? matches[0].destinationId }
    const plan = makePlan(scope, today, destinations, newHotels, matches, features, exclude, false)
    const like = photo.like ? `Похоже: ${photo.like}` : 'Похоже на ваше фото'
    plan.options = plan.options.map((o) => (o.hotel ? { ...o, reasons: [like, ...(o.reasons ?? [])] } : o))
    return { brief, question: null, text: `${seen} Нашёл похожие отели.`.trim(), data: { plan } }
  }
  const question = nextQuestion(brief, today, destinations)
  const saved = before !== undefined && savedParams(before, brief, destinations).length > 0
  if (question) {
    // What was understood is in the memory card; the model's remark leads only when nothing new was saved.
    const lead = saved ? '' : remark
    const text = lead ? `${lead} ${question.text}` : question.text
    return { brief, question, text: seen ? `${seen} ${text}` : text, data: {} }
  }
  // The sea within a distance is kept unless no hotel of the plan's cities has data on the coast.
  const strict = brief.seaMaxM !== undefined && !missing.includes('sea')
  const plan = makePlan(brief, today, destinations, newHotels, matches, features, exclude, strict)
  // Nothing within the conditions: Эвал offers to change the parameters the search went by.
  if (strict && plan.options.length === 0)
    return {
      brief,
      question,
      text: [seen, NOT_FOUND].filter(Boolean).join(' '),
      data: { notFound: brief },
    }
  const note = missingNote(missing, planCities(brief, today, destinations))
  // The answer of the tools of the store, with the hotels and the data they were chosen by, leads the plan.
  const text = [seen, response.findings, note].filter(Boolean).join(' ')
  return { brief, question, text, data: { plan } }
}

/** The hotel whose page the chat is on: its chat is about the hotel, on the page's dates. */
export interface HotelContext {
  id: string
  name: string
  dates?: StayDates
}

/** «Мои поездки» or a booking's page: the chat the traveller starts is about the bookings, or that booking. */
export interface TripsContext {
  trips: true
  bookingId?: string
}

export interface Chats {
  /** Newest first. */
  chats: Chat[]
  /** The open chat; a new one is not in the list until its first message. */
  active: Chat
  ready: boolean
  /** Signed in: the chats live in Supabase and can be shared. */
  signedIn: boolean
  /**
   * Sends the traveller's text in the open chat; `more` asks for the hotels the chat has not shown yet. With
   * `photos` the text may be empty.
   */
  send: (text: string, options?: { more?: boolean; photos?: readonly OptimizedPhoto[] }) => void
  /** Asks the failed answer again. */
  retry: (chatId: string, messageId: string) => void
  /**
   * «Подтвердить» of a proposed change of a booking's dates: the booking of this browser gets the new dates, price
   * and cancellation terms, unless it changed since the change was counted — then the proposal is outdated.
   */
  confirmChange: (chatId: string, messageId: string) => void
  rename: (chatId: string, title: string) => void
  /** Deletes the chat with its messages, here and in the account. */
  remove: (chatId: string) => void
  /** The trip's parameters edited by hand: the next answer goes by them. */
  setBrief: (chatId: string, brief: Brief) => void
  /**
   * The parameters changed in the card of «ничего не нашёл»: saved to the session (its card in the feed) and the
   * hotels are looked for again by them, without a message of the traveller.
   */
  research: (chatId: string, brief: Brief) => void
  /** Resolves once the changes so far are saved (in the account: written to Supabase), e.g. before opening a chat elsewhere. */
  flush: () => Promise<void>
  /** What shows a photo of a message: the shared link, the signed link of Storage or the preview; none reads «Фото». */
  photoUrl: PhotoUrl
  /** The photos did not reach the account: the honest line under the composer. */
  photoError: string | null
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
  /** On a hotel's page the chat the traveller starts is about the hotel; on the trips' pages, about the bookings. */
  scope?: HotelContext | TripsContext,
): Chats {
  const hotel = scope && !('trips' in scope) ? scope : undefined
  const trips = scope && 'trips' in scope ? scope : undefined
  const session = useSession()
  const [mode, setMode] = useState<Mode>({ kind: 'loading' })
  const [chats, setChats] = useState<Chat[]>([])
  const [draft, setDraft] = useState<Chat>(() => newChat())

  // The latest values for the turns that finish later.
  const chatsRef = useRef(chats)
  const activeRef = useRef(activeId)
  const modeRef = useRef(mode)
  const inflight = useRef(new Map<string, AbortController>())
  /** The pending messages already answered (or failed) in this visit: a late re-run of the effect must not ask again. */
  const answered = useRef(new Set<string>())
  /** What Supabase already has of each chat, to write only the changed ones. */
  const saved = useRef(new Map<string, Chat>())
  const queue = useRef(Promise.resolve())
  /** The photos of 1600 px of the messages sent in this visit, for the route; the chats keep only the previews. */
  const photos = useRef(new Map<string, string[]>())
  /** The signed links of the photos in Storage, by path; the paths asked once are not asked again. */
  const [signed, setSigned] = useState<ReadonlyMap<string, string>>(new Map())
  const asked = useRef(new Set<string>())
  const [photoError, setPhotoError] = useState<string | null>(null)

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
      // The guest's chats move to the account with the previews of their photos, then leave the browser.
      const guest = loadGuestChats()
      try {
        for (const chat of guest) await saveRemoteChat(client, await moveGuestPhotos(client, user.id, chat))
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
      setMode({ kind: 'remote', email: user.email ?? '', userId: user.id })
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

  // The photos in Storage are shown by signed links, asked once per path.
  useEffect(() => {
    if (mode.kind !== 'remote') return
    const client = getBrowserClient()
    const paths = [...new Set(chats.flatMap(photoPaths))].filter((path) => !asked.current.has(path))
    if (!client || paths.length === 0) return
    for (const path of paths) asked.current.add(path)
    signedPhotoUrls(client, paths)
      .then((urls) => setSigned((before) => new Map([...before, ...urls])))
      .catch((error: unknown) => console.warn(`chats: no links to the photos (${reason(error)})`))
  }, [chats, mode])

  // The links expire: a chat left open asks for new ones before that.
  useEffect(() => {
    if (mode.kind !== 'remote') return
    const timer = setInterval(() => {
      const client = getBrowserClient()
      const paths = [...new Set(chatsRef.current.flatMap(photoPaths))]
      if (!client || paths.length === 0) return
      signedPhotoUrls(client, paths)
        .then((urls) => setSigned((before) => new Map([...before, ...urls])))
        .catch((error: unknown) => console.warn(`chats: links to the photos not renewed (${reason(error)})`))
    }, SIGNED_URL_REFRESH_MS)
    return () => clearInterval(timer)
  }, [mode])

  /**
   * The photos the route looks at: those of the message just sent, or of the one Эвал asked about. This visit's
   * photos of 1600 px; after a reload the ones in Storage, else the previews.
   */
  const requestPhotos = useCallback(
    (chat: Chat, before: string): string[] | Promise<string[] | undefined> | undefined => {
      const earlier = { ...chat, messages: chat.messages.filter((m) => m.createdAt < before) }
      const message = lastPhotoMessage(earlier)
      const newest = earlier.messages.findLast((m) => m.role === 'user')
      if (!message || (message !== newest && chat.question?.id !== 'photo')) return undefined
      const kept = photos.current.get(message.id)
      if (kept) return kept
      const attachments = message.data.attachments ?? []
      const previews = attachments.flatMap((a) => a.preview ?? [])
      const fallback = previews.length > 0 ? previews : undefined
      const client = getBrowserClient()
      if (!client || !attachments.every((a) => a.path)) return fallback
      return downloadPhotos(client, photoPaths({ ...chat, messages: [message] })).catch((error: unknown) => {
        console.warn(`chats: photos not loaded (${reason(error)})`)
        return fallback
      })
    },
    [],
  )

  /** Eval's answer to the chat's pending message: its steps, then the text and the plan. */
  const runTurn = useCallback(
    async (chatId: string, pendingId: string) => {
      if (inflight.current.has(chatId) || answered.current.has(pendingId)) return
      const chat = chatsRef.current.find((c) => c.id === chatId)
      const pending = chat?.messages.find((m) => m.id === pendingId)
      if (!chat || !pending || pending.status !== 'pending') return
      const controller = new AbortController()
      inflight.current.set(chatId, controller)

      const history = dialogOf({
        ...chat,
        messages: chat.messages.filter((m) => m.createdAt < pending.createdAt),
      })
      const input = history.at(-1)?.text ?? ''
      // The question about photos is not a part of the brief.
      const question = chat.question?.id === 'photo' ? null : (chat.question?.id ?? null)
      const today = todayIso()
      // The photos of the turn; the ones kept in Storage come later, after the turn's state is set.
      const rerun = pending.data.rerun === true
      const found = rerun ? undefined : requestPhotos(chat, pending.createdAt)
      // The plan is surely due when the rules alone complete the brief: its first step shows while Эвал works.
      const planDue =
        !found &&
        !chat.brief.hotelId &&
        !nextQuestion(rerun ? chat.brief : mergeBrief(chat.brief, input, question, destinations), today)
      const waitStep = chat.brief.trips
        ? TRIPS_STEP
        : planDue
          ? SEARCH_STEP
          : chat.brief.hotelId && isHotelViewQuestion(input)
            ? VIEW_STEP
            : chat.brief.hotelId && isHotelGeoQuestion(input)
              ? GEO_STEP
              : chat.brief.hotelId && isNoiseQuestion(input)
                ? NOISE_STEP
                : null
      const stepId = newId()
      update(chatId, (c) => ({
        ...c,
        messages: [
          // Steps left pending by an earlier visit go: the turn shows its own.
          ...c.messages.filter((m) => !(m.role === 'agent' && m.status === 'pending')),
          ...(waitStep
            ? [
                {
                  id: stepId,
                  role: 'agent',
                  status: 'pending',
                  text: '',
                  data: { step: waitStep },
                  createdAt: later(pending.createdAt, -1),
                } satisfies ChatMessage,
              ]
            : []),
        ].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      }))

      try {
        // Only the photos in Storage are waited for: the turn is already marked in flight, so no other one starts.
        const sent = found instanceof Promise ? await found : found
        // A signed-in user's chat is saved first (a little while at most): the server writes the tools' runs in it.
        const remote = modeRef.current.kind === 'remote'
        if (remote) await Promise.race([queue.current, delay(SAVE_WAIT_MS)])
        if (controller.signal.aborted) return
        const ask = () =>
          askAssistant(
            {
              messages: history,
              brief: chat.brief,
              ...(sent && { photos: sent }),
              ...(rerun && { rerun }),
              ...(remote && { chatId, messageId: pendingId }),
              // The bookings of this browser as they are now, without the personal fields.
              ...(chat.brief.trips && { bookings: bookingsStore.get().slice(0, MAX_BOOKINGS).map(tripBooking) }),
            },
            rerun ? null : question,
            destinations,
            controller.signal,
          )
        // The route asks the models that see photos in turn itself: one request, its steps tell of a switch.
        const [response] = await Promise.all([ask(), delay(THINK_MS)])
        if (controller.signal.aborted) return
        answered.current.add(pendingId)
        finish(chatId, pendingId, response)
      } catch {
        if (controller.signal.aborted) return
        answered.current.add(pendingId)
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
    [destinations, newHotels, update, requestPhotos],
  )

  function finish(chatId: string, pendingId: string, response: AssistantResponse) {
    // «Другие варианты» skips the hotels the chat has shown before.
    const chat = chatsRef.current.find((c) => c.id === chatId)
    const pendingAt = chat?.messages.find((m) => m.id === pendingId)?.createdAt ?? ''
    const asked = chat?.messages.findLast((m) => m.role === 'user' && m.createdAt < pendingAt)
    const exclude = chat && asked?.data.more ? shownHotels(chat) : undefined
    // Composed before the update: a failure here fails the answer, not the render.
    const { brief: next, question, text, data } = compose(response, destinations, newHotels, exclude, chat?.brief)
    const steps = response.steps ?? []
    const now = new Date().toISOString()
    update(chatId, (chat) => {
      const pending = chat.messages.find((m) => m.id === pendingId)
      if (!pending || pending.status !== 'pending') return chat
      // What the answer saved of the trip goes right after the traveller's message, before the steps.
      const memory = savedParams(chat.brief, next, destinations)
      const userMessage = chat.messages.findLast((m) => m.role === 'user' && m.createdAt < pending.createdAt)
      const memoryMessages: ChatMessage[] =
        memory.length > 0
          ? [
              {
                id: newId(),
                role: 'agent',
                status: 'done',
                text: '',
                data: { memory },
                createdAt: userMessage ? later(userMessage.createdAt, 1) : later(pending.createdAt, -steps.length - 1),
              },
            ]
          : []
      // The turn's steps go right before the answer, in their order.
      const stepMessages: ChatMessage[] = steps.map((step, i) => ({
        id: newId(),
        role: 'agent',
        status: step.status,
        text: '',
        data: {
          step: {
            agent: step.agent,
            title: step.title,
            ...(step.params && { params: step.params }),
            ...(step.result && { result: step.result }),
            ...(step.run && { run: step.run }),
          },
        },
        createdAt: later(pending.createdAt, i - steps.length),
      }))
      // No text model answered and the rules did: Эвал says so in a message of its own, right after the answer.
      const down: ChatMessage[] = response.modelsDown
        ? [
            {
              id: newId(),
              role: 'assistant',
              status: 'done',
              text: MODELS_DOWN,
              data: {},
              createdAt: later(pending.createdAt, 1),
            },
          ]
        : []
      const messages = [
        ...mergeSteps(
          chat.messages.filter((m) => !(m.role === 'agent' && m.status === 'pending')),
          stepMessages,
        ),
        ...memoryMessages,
        ...down,
      ]
        .map((m) => (m.id === pendingId ? { ...m, status: 'done' as const, text, data } : m))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      return {
        ...chat,
        brief: next,
        question,
        messages,
        unread: activeRef.current !== chatId,
        updatedAt: now,
      }
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

  const send = (raw: string, options: { more?: boolean; photos?: readonly OptimizedPhoto[] } = {}) => {
    const text = raw.trim()
    const sent = options.photos ?? []
    // The newest state, not the render's: two calls before a re-render are one message.
    const current = chatsRef.current.find((c) => c.id === active.id) ?? active
    if ((!text && sent.length === 0) || current.messages.some((m) => m.status === 'pending')) return
    const now = new Date().toISOString()
    const user: ChatMessage = {
      id: newId(),
      role: 'user',
      status: 'done',
      text,
      data: {
        ...(options.more && { more: true as const }),
        ...(sent.length > 0 && {
          attachments: sent.map(({ preview, width, height }) => ({ preview, width, height })),
        }),
      },
      createdAt: now,
    }
    if (sent.length > 0)
      photos.current.set(
        user.id,
        sent.map((p) => p.photo),
      )
    // The memory and the steps of the turn go between the message and the answer: room for them in the order.
    const pending: ChatMessage = {
      id: newId(),
      role: 'assistant',
      status: 'pending',
      text: '',
      data: {},
      createdAt: later(now, ANSWER_GAP_MS),
    }
    // A chat about a hotel is named after it, and the page's dates go to the next answer; a chat of the trips' pages
    // is about the bookings.
    const about = hotel && (!current.brief.hotelId || current.brief.hotelId === hotel.id)
    const ownTrips = trips && current.messages.length === 0
    const title = ownTrips
      ? chatTitle(trips.bookingId ? `Бронирование ${trips.bookingId}` : 'Мои поездки')
      : about && hotel
        ? chatTitle(hotel.name)
        : chatTitle(text || PHOTO_TEXT)
    const chat: Chat = {
      ...current,
      title: current.title || title,
      brief: ownTrips
        ? { trips: true, ...(trips.bookingId && { bookingId: trips.bookingId }) }
        : about && hotel
          ? { ...current.brief, hotelId: hotel.id, ...(hotel.dates && briefWithStay(hotel.dates)) }
          : current.brief,
      messages: [...current.messages, user, pending],
      unread: false,
      updatedAt: now,
    }
    chatsRef.current = [chat, ...chatsRef.current.filter((c) => c.id !== chat.id)]
    setChats((list) => [chat, ...list.filter((c) => c.id !== chat.id)])
    if (!listed) setDraft(newChat())
    // The turn starts from the effect above, once the chat is in the list.
    if (sent.length > 0) savePhotos(chat.id, user)
  }

  /** A signed-in user's photos go to Storage; the message gets their paths, the preview stays in memory. */
  const savePhotos = (chatId: string, message: ChatMessage) => {
    const current = modeRef.current
    const client = getBrowserClient()
    const full = photos.current.get(message.id)
    if (current.kind !== 'remote' || !client || !full) return
    setPhotoError(null)
    uploadPhotos(client, current.userId, chatId, message, full)
      .then((attachments) =>
        update(chatId, (chat) => ({
          ...chat,
          messages: chat.messages.map((m) => (m.id === message.id ? { ...m, data: { ...m.data, attachments } } : m)),
        })),
      )
      .catch((error: unknown) => {
        console.warn(`chats: photos not saved (${reason(error)})`)
        setPhotoError(PHOTO_SAVE_ERROR)
      })
  }

  const retry = (chatId: string, messageId: string) => {
    answered.current.delete(messageId)
    update(chatId, (chat) => ({
      ...chat,
      messages: chat.messages.map((m) => (m.id === messageId ? { ...m, status: 'pending', text: '' } : m)),
    }))
  }

  const confirmChange = (chatId: string, messageId: string) => {
    const message = chatsRef.current.find((c) => c.id === chatId)?.messages.find((m) => m.id === messageId)
    const change = message?.data.change
    if (!change || change.state !== 'proposed') return
    const booking = findBooking(bookingsStore.get(), change.proposal.bookingId)
    const next = booking && applyDateChange(booking, change.proposal, todayIso())
    if (next) saveBooking(next)
    const state = next ? 'applied' : 'outdated'
    update(chatId, (chat) => ({
      ...chat,
      messages: chat.messages.map((m) =>
        m.id === messageId && m.data.change ? { ...m, data: { ...m.data, change: { ...m.data.change, state } } } : m,
      ),
      updatedAt: new Date().toISOString(),
    }))
  }

  const rename = (chatId: string, raw: string) => {
    const title = chatTitle(raw)
    if (title) update(chatId, (chat) => ({ ...chat, title }))
  }

  const remove = (chatId: string) => {
    inflight.current.get(chatId)?.abort()
    inflight.current.delete(chatId)
    const removed = chatsRef.current.find((c) => c.id === chatId)
    setChats((list) => list.filter((c) => c.id !== chatId))
    if (modeRef.current.kind !== 'remote') return
    const client = getBrowserClient()
    if (!client) return
    saved.current.delete(chatId)
    // The photos go first; a failure to delete them does not keep the chat.
    const paths = removed ? photoPaths(removed) : []
    queue.current = queue.current
      .then(() =>
        deleteRemotePhotos(client, paths).catch((error: unknown) => {
          console.warn(`chats: photos not deleted (${reason(error)})`)
        }),
      )
      .then(() => deleteRemoteChat(client, chatId))
      .catch((error: unknown) => {
        console.warn(`chats: not deleted (${error instanceof Error ? error.message.slice(0, 200) : 'error'})`)
      })
  }

  /** «Сохранил в память сессии»: the card of what a change of the brief by hand saved, at `now`. */
  const memoryMessage = (chat: Chat, brief: Brief, now: string): ChatMessage[] => {
    const memory = savedParams(chat.brief, brief, destinations)
    return chat.messages.length > 0 && memory.length > 0
      ? [{ id: newId(), role: 'agent', status: 'done', text: '', data: { memory }, createdAt: now }]
      : []
  }

  const setBrief = (chatId: string, brief: Brief) => {
    const now = new Date().toISOString()
    // The question asked follows the new brief: the answer of a date question is given by the dates set.
    const edit = (chat: Chat): Chat => ({
      ...chat,
      brief,
      question: chat.question && nextQuestion(brief, todayIso(), destinations),
      messages: [...chat.messages, ...memoryMessage(chat, brief, now)],
    })
    if (listed?.id === chatId || chats.some((c) => c.id === chatId)) update(chatId, edit)
    else if (active.id === chatId) setDraft(edit({ ...active }))
  }

  const research = (chatId: string, brief: Brief) => {
    const chat = chatsRef.current.find((c) => c.id === chatId)
    if (!chat || chat.messages.some((m) => m.status === 'pending')) return
    const now = new Date().toISOString()
    const memory = memoryMessage(chat, brief, now)
    // Nothing changed: nothing to look for again.
    if (memory.length === 0) return
    const pending: ChatMessage = {
      id: newId(),
      role: 'assistant',
      status: 'pending',
      text: '',
      data: { rerun: true },
      createdAt: later(now, ANSWER_GAP_MS),
    }
    const next: Chat = {
      ...chat,
      brief,
      question: null,
      messages: [...chat.messages, ...memory, pending],
      updatedAt: now,
    }
    chatsRef.current = [next, ...chatsRef.current.filter((c) => c.id !== chatId)]
    setChats((list) => [next, ...list.filter((c) => c.id !== chatId)])
    // The turn starts from the effect that finishes the pending answers.
  }

  return {
    chats,
    active,
    ready: mode.kind !== 'loading',
    signedIn: mode.kind === 'remote',
    send,
    retry,
    confirmChange,
    rename,
    remove,
    setBrief,
    research,
    flush: () => queue.current,
    photoUrl: (attachment, size) => {
      const stored = attachment.url ?? (attachment.path ? signed.get(attachment.path) : undefined)
      return size === 'full' ? (stored ?? attachment.preview) : (attachment.preview ?? stored)
    },
    photoError,
  }
}
