import { z } from 'zod'
import { answerWithModel, ruleAnswer } from '@/lib/ai/hotelAnswer'
import { getAssistantModel, getVisionModel } from '@/lib/ai/model'
import { APICallError } from 'ai'
import { allowRequest, allowVisionRequest, clientIp } from '@/lib/ai/rateLimit'
import { SEMANTIC_TIMEOUT_MS, semanticSearch } from '@/lib/ai/semantic'
import { MATCHES, runTurn, type TurnContext } from '@/lib/ai/turn'
import { MODEL_TIMEOUT_MS, understandWish } from '@/lib/ai/understand'
import {
  MAX_PHOTO_URL_LENGTH,
  PHOTO_DATA_URL,
  modelPhotoIntent,
  photoIntent,
  refinedText,
  seePhotos,
  sightFeatures,
  similarQueries,
  type PhotoSight,
} from '@/lib/ai/vision'
import {
  MAX_HISTORY,
  MAX_MESSAGE_LENGTH,
  MAX_PHOTOS,
  foldBrief,
  mergeBrief,
  nextQuestion,
  normalizeBrief,
  type AssistantRequest,
  type AssistantResponse,
  type Brief,
  type TurnStep,
} from '@/lib/assistant'
import type { HotelSummary } from '@/lib/catalog'
import type { Destination } from '@/data/destinations'
import { loadDestinations, loadHotel, loadHotelSummaries } from '@/lib/db/catalog'
import { loadHotelFeatures } from '@/lib/db/features'
import { todayIso, type IsoDate } from '@/lib/dates'
import type { Hotel } from '@/lib/catalog'

const requestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) }))
    .min(1)
    .max(MAX_HISTORY)
    .refine((messages) => messages.at(-1)?.role === 'user', 'The last message is the traveller’s'),
  brief: z.record(z.string(), z.unknown()).default({}),
  // About 4 × 300 KB of optimised photos: the body stays within the 4.5 MB of a Vercel function.
  photos: z.array(z.string().max(MAX_PHOTO_URL_LENGTH).regex(PHOTO_DATA_URL)).max(MAX_PHOTOS).optional(),
})

/** The answer is due in 14 s: the client waits 15. The steps of the turn get what the model left. */
const ANSWER_BUDGET_MS = 14_000
/** With photos the model that sees them takes up to 12 s first: the answer is due in 28 s, the client waits 30. */
const PHOTO_BUDGET_MS = 28_000
/** The look at the photos needs this much of the answer's time to be worth starting. */
const MIN_VISION_MS = 3000
/** The first try of the search for similar hotels; usually it takes about 2 s. */
const FIRST_SEARCH_MS = 6000
/** A retry of the search needs this much time to be worth starting. */
const MIN_SEARCH_MS = 2000
/** Left of the answer's time for the hotels' summaries and the answer itself. */
const SEARCH_RESERVE_MS = 500

const warn = (what: string, error: unknown) => {
  // The kind and the provider's short message; never the request itself.
  const reason = error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : String(error)
  // The provider's status and its short answer: an empty message tells nothing.
  const call = APICallError.isInstance(error)
    ? `, HTTP ${error.statusCode ?? '—'}${error.responseBody ? `: ${error.responseBody.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`
    : ''
  console.warn(`assistant: ${what} (${reason}${call})`)
}

/**
 * Once the brief is complete and the plan is due, Эвал's turn runs its steps (src/lib/ai/turn.ts): the hotels by
 * meaning, then their building, noise and views when the traveller asked of them. Nothing found keeps the plan on
 * the rules; the steps go to the answer for the feed.
 */
async function planTurn(context: Omit<TurnContext, 'summaries' | 'features'>): Promise<Partial<AssistantResponse>> {
  if (nextQuestion(context.brief, context.today)) return {}
  let summaries: Promise<HotelSummary[]> | undefined
  const { state, steps } = await runTurn({
    ...context,
    summaries: () => (summaries ??= loadHotelSummaries().catch(() => [])),
    features: loadHotelFeatures,
  })
  return {
    ...(state.matches?.length && { matches: state.matches }),
    ...(state.features && Object.keys(state.features).length > 0 && { features: state.features }),
    ...(state.missing?.length && { missing: state.missing }),
    steps,
  }
}

/**
 * A question about the hotel the chat is on: the model answers from the hotel's data, with its general knowledge
 * apart; on a missing key, an error or a timeout the rules answer the ready-made questions (src/lib/ai/hotelAnswer.ts).
 */
async function hotelTurn(
  hotel: Hotel,
  {
    brief,
    messages,
    signal,
    deadline,
  }: { brief: Brief; messages: AssistantRequest['messages']; signal: AbortSignal; deadline: number },
): Promise<Response> {
  const next: Brief = { ...brief, hotelId: hotel.id, destinationId: hotel.destinationId }
  const model = await getAssistantModel()
  if (model) {
    try {
      const features = (await loadHotelFeatures().catch(() => null))?.get(hotel.id)
      const { answer, unverified } = await answerWithModel(model, { messages }, hotel, {
        dates: brief.dates,
        features,
        signal,
        timeoutMs: Math.min(MODEL_TIMEOUT_MS, deadline - Date.now()),
      })
      return Response.json({
        brief: next,
        reply: answer,
        ...(unverified && { unverified }),
        source: 'model',
      } satisfies AssistantResponse)
    } catch (error) {
      if (signal.aborted) throw error
      const reason = error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : String(error)
      console.warn(`assistant: model failed on a hotel question, using the rules (${reason})`)
    }
  }
  const { answer } = ruleAnswer(messages[messages.length - 1].text, hotel, brief.dates)
  return Response.json({ brief: next, reply: answer, source: 'rules' } satisfies AssistantResponse)
}

interface WishContext {
  messages: AssistantRequest['messages']
  brief: Brief
  today: IsoDate
  destinations: readonly Destination[]
  deadline: number
  signal: AbortSignal
}

/**
 * Reads the traveller's newest message into the brief with the language model; without a key, on a model
 * error or after 8 s — with the rules, so the dialog goes on either way. Once the brief is complete, runs the steps
 * of the turn (`planTurn`) for the hotels (`matches`), their features and the steps' lines.
 */
async function wishTurn({ messages, brief, today, destinations, deadline, signal }: WishContext) {
  const input = messages[messages.length - 1].text
  // The question the client showed is the one the brief still lacks.
  const asked = nextQuestion(brief, today)?.id ?? null
  const wish = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.text)
    .join('. ')
  const found = (next: Brief) => planTurn({ brief: next, wish, today, destinations, deadline, signal })

  const model = await getAssistantModel()
  if (model) {
    try {
      const { parsed, reply } = await understandWish(model, { messages, brief }, today, destinations, signal)
      const next = foldBrief(brief, parsed, input, asked)
      return { brief: next, reply, source: 'model', ...(await found(next)) } satisfies AssistantResponse
    } catch (error) {
      warn('model failed, using the rules', error)
    }
  }
  const next = mergeBrief(brief, input, asked, destinations)
  return { brief: next, source: 'rules', ...(await found(next)) } satisfies AssistantResponse
}

/** What the photos show, or `null` without the model, over the limit, on an error or a timeout. */
async function look(photos: readonly string[], ip: string, deadline: number, signal: AbortSignal) {
  const timeoutMs = deadline - Date.now() - MIN_VISION_MS
  if (timeoutMs < MIN_VISION_MS || !allowVisionRequest(ip)) return null
  const model = await getVisionModel()
  if (!model) return null
  try {
    return await seePhotos(model, photos, { signal, timeoutMs })
  } catch (error) {
    if (signal.aborted) throw error
    warn('the photos were not seen', error)
    return null
  }
}

/** The hotels by the meaning of the photo's description, in the brief's city when it has one. */
async function similarTurn(sight: PhotoSight, { brief, deadline, signal }: WishContext) {
  const title = 'Ищу отели, похожие на фото'
  const like = sightFeatures(sight)
  const [query, retry] = similarQueries(sight)
  // `null` is both «nothing found» and a failure: one that took the whole time is the search not answering.
  let missed = false
  const search = async (text: string, timeoutMs: number) => {
    const start = Date.now()
    const hits = await semanticSearch(text, {
      ...(brief.destinationId && { destinationIds: [brief.destinationId] }),
      k: MATCHES,
      timeoutMs,
      signal,
    })
    missed = !hits && Date.now() - start >= timeoutMs * 0.9
    return hits
  }
  // The embedding of the NVIDIA API now and then stalls for minutes: a short first try, then other words with
  // the rest of the answer's time.
  let hits = await search(query, Math.min(FIRST_SEARCH_MS, deadline - Date.now() - SEARCH_RESERVE_MS))
  const left = Math.min(SEMANTIC_TIMEOUT_MS, deadline - Date.now() - SEARCH_RESERVE_MS)
  if (!hits && left >= MIN_SEARCH_MS) hits = await search(retry, left)
  const byId = new Map(hits?.length ? (await loadHotelSummaries().catch(() => [])).map((h) => [h.id, h]) : [])
  const matches = (hits ?? []).flatMap((hit) => byId.get(hit.id) ?? [])
  const step: TurnStep = missed
    ? { agent: 'search', title, status: 'failed', result: 'поиск не ответил' }
    : {
        agent: 'search',
        title,
        status: 'done',
        result: matches.length ? `нашёл ${matches.length}` : 'похожих не нашёл',
      }
  return {
    brief,
    source: 'model',
    photo: {
      action: 'similar',
      seen: sight.description,
      ...(like && { like }),
      ...(missed ? { missed: true as const } : {}),
    },
    ...(matches.length > 0 && { matches }),
    steps: [step],
  } satisfies AssistantResponse
}

/**
 * A message with photos: what to do with them comes from its words (the rules, then the text model), otherwise
 * Эвал asks. «Найти похожие» looks for the hotels by the meaning of the photo's description; «Учесть в запросе» adds
 * what the photo shows to the message, and the wish is read as usual. Without the model that sees photos Эвал says
 * it could not look at them.
 */
async function photoTurn(photos: readonly string[], ip: string, context: WishContext): Promise<AssistantResponse> {
  const { messages, brief, signal, deadline } = context
  const input = messages[messages.length - 1].text
  let intent = photoIntent(input)
  if (intent === 'unclear' && input.trim()) {
    const model = await getAssistantModel()
    if (model)
      intent = await modelPhotoIntent(model, input, { signal }).catch((error: unknown) => {
        if (signal.aborted) throw error
        warn('the intent of the photos was not read', error)
        return 'unclear' as const
      })
  }
  if (intent === 'unclear') return { brief, source: 'rules', photo: { action: 'ask' } }
  const sight = await look(photos, ip, deadline, signal)
  if (!sight) return { brief, source: 'rules', photo: { action: 'unseen' } }
  // Nothing on the photo to choose a hotel by: no search and no wish of it, Эвал asks for words.
  if (sight.unusable) return { brief, source: 'model', photo: { action: 'unusable', seen: sight.description } }
  if (intent === 'similar') return similarTurn(sight, context)
  const text = refinedText(input, sight).slice(0, MAX_MESSAGE_LENGTH)
  const answer = await wishTurn({ ...context, messages: [...messages.slice(0, -1), { role: 'user', text }] })
  return { ...answer, photo: { action: 'refine', seen: sight.description } }
}

/**
 * The traveller's newest message: about the chat's hotel (`hotelTurn`), with photos (`photoTurn`) or a wish
 * (`wishTurn`).
 */
export async function POST(request: Request) {
  const ip = clientIp(request)
  if (!allowRequest(ip)) return Response.json({ error: 'Too many requests' }, { status: 429 })
  const parsedBody = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) return Response.json({ error: 'Invalid request' }, { status: 400 })

  const { messages, photos = [] } = parsedBody.data
  const deadline = Date.now() + (photos.length > 0 ? PHOTO_BUDGET_MS : ANSWER_BUDGET_MS)
  const destinations = await loadDestinations().catch(() => null)
  if (!destinations) return Response.json({ error: 'Catalog unavailable' }, { status: 503 })
  const brief = normalizeBrief(parsedBody.data.brief, destinations)
  const today = todayIso()
  // A chat about a hotel answers about it; an id the catalogue does not know is a chat like any other.
  const hotel = brief.hotelId ? await loadHotel(brief.hotelId).catch(() => undefined) : undefined
  if (brief.hotelId && !hotel) delete brief.hotelId
  if (hotel) return hotelTurn(hotel, { brief, messages, signal: request.signal, deadline })
  const context: WishContext = { messages, brief, today, destinations, deadline, signal: request.signal }
  return Response.json(photos.length > 0 ? await photoTurn(photos, ip, context) : await wishTurn(context))
}
