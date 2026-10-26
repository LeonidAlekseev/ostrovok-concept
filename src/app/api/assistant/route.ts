import { z } from 'zod'
import { firstAnswer } from '@/lib/ai/chain'
import { answerWithModel, ruleAnswer } from '@/lib/ai/hotelAnswer'
import { getTextModels, getVisionModels } from '@/lib/ai/model'
import { APICallError } from 'ai'
import { allowRequest, allowVisionRequest, clientIp } from '@/lib/ai/rateLimit'
import { SEMANTIC_TIMEOUT_MS, semanticSearch } from '@/lib/ai/semantic'
import { MATCHES, runTurn, type TurnContext } from '@/lib/ai/turn'
import { MODEL_TIMEOUT_MS, understandWish } from '@/lib/ai/understand'
import {
  INTENT_TIMEOUT_MS,
  MAX_PHOTO_URL_LENGTH,
  PHOTO_DATA_URL,
  modelPhotoIntent,
  ownWords,
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
import { loadHotelDetails } from '@/lib/db/hotelDetails'
import { loadHotelNoise } from '@/lib/db/noise'
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

/** The answer is due in 15 s: the client waits 16. The steps of the turn get what the model left. */
const ANSWER_BUDGET_MS = 15_000
/** With photos the models that see them take up to 18 s first: the answer is due in 28 s, the client waits 30. */
const PHOTO_BUDGET_MS = 28_000
/** The models that see photos leave this much of the answer's time for the text models and the search. */
const VISION_RESERVE_MS = 10_000
/** A model that sees photos needs this much time to be worth asking. */
const MIN_VISION_MS = 3000
/** The step of the feed when the first model that sees photos failed and the next ones were asked. */
const VISION_SWITCH_STEP = 'Модель фото не ответила, смотрю другой'
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

/** The text models' time: 9 s at most, never past the answer's `deadline`. */
const textDeadline = (deadline: number) => Math.min(Date.now() + MODEL_TIMEOUT_MS, deadline)

/**
 * Once the brief is complete and the plan is due, Эвал's turn runs its steps (src/lib/ai/turn.ts): the hotels by
 * meaning, then their building, noise and views when the traveller asked of them. Nothing found keeps the plan on
 * the rules; the steps go to the answer for the feed. A search that failed twice sets `modelsDown`.
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
    ...(state.semanticDown && { modelsDown: true as const }),
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
  const [models, details, noise] = await Promise.all([
    getTextModels(),
    loadHotelDetails(hotel.id),
    loadHotelNoise(hotel),
  ])
  let down = false
  if (models) {
    const features = (await loadHotelFeatures().catch(() => null))?.get(hotel.id)
    const result = await firstAnswer(
      models,
      (model, timeout) =>
        answerWithModel(model, { messages }, hotel, { dates: brief.dates, features, details, noise, signal: timeout }),
      {
        deadline: textDeadline(deadline),
        signal,
        onError: (id, error) => warn(`${id} failed on a hotel question`, error),
      },
    )
    if (result.ok) {
      const { answer, unverified } = result.value
      return Response.json({
        brief: next,
        reply: answer,
        ...(unverified && { unverified }),
        source: 'model',
      } satisfies AssistantResponse)
    }
    down = result.failed.length > 0
    console.warn('assistant: no model answered a hotel question, using the rules')
  }
  const { answer } = ruleAnswer(messages[messages.length - 1].text, hotel, brief.dates, details, noise)
  return Response.json({
    brief: next,
    reply: answer,
    source: 'rules',
    ...(down && { modelsDown: true }),
  } satisfies AssistantResponse)
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
 * Reads the traveller's newest message into the brief with the text models in turn; without a key, or when none of
 * them answered in 9 s — with the rules, so the dialog goes on either way, and Эвал says the models are down. Once the brief is complete, runs the steps
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

  const models = await getTextModels()
  let down = false
  if (models) {
    const result = await firstAnswer(
      models,
      (model, timeout) => understandWish(model, { messages, brief }, today, destinations, timeout),
      { deadline: textDeadline(deadline), signal, onError: (id, error) => warn(`${id} failed`, error) },
    )
    if (result.ok) {
      const { parsed, reply } = result.value
      const next = foldBrief(brief, parsed, input, asked)
      return { brief: next, reply, source: 'model', ...(await found(next)) } satisfies AssistantResponse
    }
    down = result.failed.length > 0
    console.warn('assistant: no model answered, using the rules')
  }
  const next = mergeBrief(brief, input, asked, destinations)
  return {
    brief: next,
    source: 'rules',
    ...(down && { modelsDown: true as const }),
    ...(await found(next)),
  } satisfies AssistantResponse
}

/**
 * What the photos show, by the models that see photos in turn (each with the same photos), with the step of the
 * switch when the first failed; `null` without the models or the time for them; `limited` over the limit (ours, or
 * the provider's 429 of every model); `failed` when none answered (an error, a timeout, an answer not in Russian).
 */
async function look(
  photos: readonly string[],
  ip: string,
  deadline: number,
  signal: AbortSignal,
): Promise<{ sight: PhotoSight; steps: TurnStep[] } | { failed: 'limited' | 'down'; steps: TurnStep[] } | null> {
  const until = deadline - VISION_RESERVE_MS
  if (until - Date.now() < MIN_VISION_MS) return null
  if (!(await allowVisionRequest(ip))) return { failed: 'limited', steps: [] }
  const models = await getVisionModels()
  if (!models) return null
  const result = await firstAnswer(models, (model, timeout) => seePhotos(model, photos, { signal: timeout }), {
    deadline: until,
    signal,
    minMs: MIN_VISION_MS,
    onError: (id, error) => warn(`${id} did not see the photos`, error),
  })
  const steps: TurnStep[] =
    result.failed.length === 0
      ? []
      : [
          result.ok
            ? { agent: 'vision', title: VISION_SWITCH_STEP, status: 'done', result: 'посмотрел' }
            : { agent: 'vision', title: VISION_SWITCH_STEP, status: 'failed', result: 'ни одна модель не ответила' },
        ]
  if (result.ok) return { sight: result.value, steps }
  if (result.limited) return { failed: 'limited', steps: [] }
  return { failed: 'down', steps }
}

/** The hotels by the meaning of the photo's description, in the brief's city when it has one. */
async function similarTurn(sight: PhotoSight, { brief, deadline, signal }: WishContext) {
  const title = 'Ищу отели, похожие на фото'
  const like = sightFeatures(sight)
  const [query, retry] = similarQueries(sight)
  let missed = false
  const search = async (text: string, timeoutMs: number) => {
    const result = await semanticSearch(text, {
      ...(brief.destinationId && { destinationIds: [brief.destinationId] }),
      k: MATCHES,
      timeoutMs,
      signal,
    })
    // Only a failure is the search not answering; nothing found is an answer.
    missed = result.status === 'failed'
    return result.status === 'found' ? result.hits : null
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
 * what the photo shows to the message, and the wish is read as usual. Without the models that see photos Эвал says
 * it could not look at them; when none of them answered, the text models answer the message's words without them.
 * The next photos start with the first model again: nothing of a failure is kept.
 */
async function photoTurn(photos: readonly string[], ip: string, context: WishContext): Promise<AssistantResponse> {
  const { messages, brief, signal, deadline } = context
  const input = messages[messages.length - 1].text
  let intent = photoIntent(input)
  let down = false
  if (intent === 'unclear' && input.trim()) {
    const models = await getTextModels()
    if (models) {
      const result = await firstAnswer(
        models,
        (model, timeout) => modelPhotoIntent(model, input, { signal: timeout }),
        {
          deadline: Math.min(Date.now() + INTENT_TIMEOUT_MS, deadline),
          signal,
          onError: (id, error) => warn(`${id} did not read the intent of the photos`, error),
        },
      )
      if (result.ok) intent = result.value
      else down = result.failed.length > 0
    }
  }
  if (intent === 'unclear')
    return { brief, source: 'rules', photo: { action: 'ask' }, ...(down && { modelsDown: true as const }) }
  const seen = await look(photos, ip, deadline, signal)
  if (!seen) return { brief, source: 'rules', photo: { action: 'unseen' } }
  const { steps } = seen
  const withSteps = (answer: AssistantResponse): AssistantResponse => {
    const all = [...steps, ...(answer.steps ?? [])]
    return { ...answer, ...(all.length > 0 && { steps: all }) }
  }
  if ('failed' in seen) {
    if (seen.failed === 'limited') return { brief, source: 'rules', photo: { action: 'limited' } }
    // No model saw the photos: the text models answer the message's words with the chat's context, Эвал says so.
    if (!ownWords(input)) return withSteps({ brief, source: 'rules', photo: { action: 'unseen' } })
    return withSteps({ ...(await wishTurn(context)), photo: { action: 'skipped' } })
  }
  const { sight } = seen
  // Nothing on the photo to choose a hotel by: no search and no wish of it, Эвал asks for words.
  if (sight.unusable)
    return withSteps({ brief, source: 'model', photo: { action: 'unusable', seen: sight.description } })
  if (intent === 'similar') return withSteps(await similarTurn(sight, context))
  const text = refinedText(input, sight).slice(0, MAX_MESSAGE_LENGTH)
  const answer = await wishTurn({ ...context, messages: [...messages.slice(0, -1), { role: 'user', text }] })
  return withSteps({ ...answer, photo: { action: 'refine', seen: sight.description } })
}

/**
 * The traveller's newest message: about the chat's hotel (`hotelTurn`), with photos (`photoTurn`) or a wish
 * (`wishTurn`).
 */
export async function POST(request: Request) {
  const ip = clientIp(request)
  if (!(await allowRequest(ip))) return Response.json({ error: 'Too many requests' }, { status: 429 })
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
