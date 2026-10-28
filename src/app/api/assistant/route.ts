import { apiError } from '@/lib/api'
import { firstAnswer } from '@/lib/ai/chain'
import { geoTurn } from '@/lib/ai/geoTurn'
import { viewTurn } from '@/lib/ai/viewTurn'
import { noiseWidget } from '@/lib/chatWidget'
import { answerWithModel, ruleAnswer } from '@/lib/ai/hotelAnswer'
import { getTextModels, getVisionModels } from '@/lib/ai/model'
import { APICallError } from 'ai'
import { allowRequest, allowVisionRequest, clientIp } from '@/lib/ai/rateLimit'
import { SEMANTIC_TIMEOUT_MS, semanticSearch } from '@/lib/ai/semantic'
import { MATCHES, featuresStep, runTurn, type TurnContext } from '@/lib/ai/turn'
import {
  KNOWLEDGE_PLAN_MS,
  knowledgeTurn,
  planKnowledge,
  rulesKnowledge,
  type KnowledgeDeps,
} from '@/lib/ai/knowledgeTurn'
import { runFeaturesTool, runNearTool, runReviewsTool, type Candidate } from '@/lib/ai/knowledgeTools'
import { loadHotelierNoise } from '@/lib/db/claims'
import { loadLevelIndex, loadNearIndex } from '@/lib/db/knowledge'
import { MODEL_TIMEOUT_MS, understandWish } from '@/lib/ai/understand'
import {
  INTENT_TIMEOUT_MS,
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
  MAX_MESSAGE_LENGTH,
  foldBrief,
  mergeBrief,
  nextQuestion,
  normalizeBrief,
  planCities,
  type AssistantRequest,
  type AssistantResponse,
  type Brief,
  type TurnStep,
} from '@/lib/assistant'
import type { HotelSummary } from '@/lib/catalog'
import type { Destination } from '@/data/destinations'
import { loadDestinations, loadHotel, loadHotels, loadHotelSummaries } from '@/lib/db/catalog'
import { bookingTurn } from '@/lib/ai/bookingTurn'
import { loadHotelFeatures } from '@/lib/db/features'
import { loadHotelDetails } from '@/lib/db/hotelDetails'
import { loadHotelNoise } from '@/lib/db/noise'
import { serviceClient } from '@/lib/db/hotelierKnowledge'
import { recordRun, runOwner } from '@/lib/db/toolRuns'
import { NOISE_TOOL, NOISE_TOOL_PARAMS, NOISE_TOOL_TITLE, runNoiseTool } from '@/lib/ai/noiseTool'
import { ASK_HOTELIER_TITLE, ASK_HOTELIER_TOOL, runAskHotelier } from '@/lib/ai/hotelierTool'
import { loadHotelierClaims } from '@/lib/db/claims'
import { clipText } from '@/lib/format'
import { asksHotelier, characteristicLabel, questionKeys, type HotelierKey } from '@/lib/hotelierFacts'
import { isHotelGeoQuestion, isHotelViewQuestion, isNoiseQuestion } from '@/lib/noise'
import type { ToolRun } from '@/lib/toolResult'
import { todayIso, type IsoDate } from '@/lib/dates'
import type { Hotel } from '@/lib/catalog'
import { assistantRequestSchema } from './schema'

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
async function planTurn(
  context: Omit<TurnContext, 'summaries' | 'features'>,
  { messages, chatId, messageId }: Pick<WishContext, 'messages' | 'chatId' | 'messageId'>,
): Promise<Partial<AssistantResponse>> {
  if (nextQuestion(context.brief, context.today)) return {}
  let summaries: Promise<HotelSummary[]> | undefined
  const loadSummaries = () => (summaries ??= loadHotelSummaries().catch(() => []))
  // The wish asks of the noise, a place near or the reviews: the model chooses the tools of the store while the
  // search runs, and the search leaves them their time.
  const rules = rulesKnowledge(context.wish, context.brief)
  const knowledge = rules.length > 0
  const models = knowledge ? await getTextModels() : undefined
  const plan = knowledge
    ? planKnowledge(messages, rules, {
        models,
        deadline: Math.min(Date.now() + KNOWLEDGE_PLAN_MS, context.deadline - KNOWLEDGE_TIME_MS),
        signal: context.signal,
        onError: (id, error) => warn(`${id} did not choose the knowledge calls`, error),
      })
    : null
  const owner = knowledge ? runOwner(chatId, messageId) : null
  const { state, steps } = await runTurn({
    ...context,
    deadline: knowledge ? context.deadline - KNOWLEDGE_TIME_MS : context.deadline,
    knowledge,
    summaries: loadSummaries,
    features: loadHotelFeatures,
  })
  let findings: string | undefined
  let modelsDown = state.semanticDown === true
  if (plan && owner) {
    const all = await loadSummaries()
    const candidates = knowledgeCandidates(all, state, planCities(context.brief, context.today, context.destinations))
    const outcome = await knowledgeTurn(plan, candidates, {
      wish: context.wish,
      owner,
      models,
      deadline: context.deadline,
      signal: context.signal,
      deps: KNOWLEDGE_DEPS,
      onError: (id, error) => warn(`${id} gave no remark over the knowledge`, error),
    })
    steps.push(...outcome.steps)
    findings = outcome.text
    modelsDown ||= outcome.modelsDown === true
    if (outcome.chosen.length === 0 && context.brief.quiet) {
      // The store chose none: the quiet goes by the hotels' features as before, its step after the tools'.
      const fallback = await runTurn({ ...context, summaries: loadSummaries, features: loadHotelFeatures }, [
        featuresStep,
      ])
      steps.push(...fallback.steps)
      Object.assign(state, fallback.state)
    }
    if (outcome.chosen.length > 0) {
      const byId = new Map(all.map((h) => [h.id, h]))
      state.matches = outcome.chosen.flatMap((id) => byId.get(id) ?? [])
      const features = await loadHotelFeatures().catch(() => null)
      state.features = Object.fromEntries(
        outcome.chosen.flatMap((id) => (features?.has(id) ? [[id, features.get(id)!]] : [])),
      )
    }
  }
  return {
    ...(state.matches?.length && { matches: state.matches }),
    ...(state.features && Object.keys(state.features).length > 0 && { features: state.features }),
    ...(state.missing?.length && { missing: state.missing }),
    ...(modelsDown && { modelsDown: true as const }),
    ...(findings && { findings }),
    steps,
  }
}

/** The answer's time the tools of the store keep for themselves after the earlier steps. */
const KNOWLEDGE_TIME_MS = 4000

/** The store's reads and the runs of the tools, as the route does them. */
const KNOWLEDGE_DEPS: KnowledgeDeps = {
  levels: loadLevelIndex,
  hotelierNoise: loadHotelierNoise,
  near: loadNearIndex,
  runFeatures: runFeaturesTool,
  runNear: runNearTool,
  runReviews: runReviewsTool,
  record: recordRun,
}

/**
 * The hotels the tools of the store choose among: those the features step kept (by the sea, the views), else every
 * hotel of the plan's cities; the search by meaning's first, then the best rated.
 */
function knowledgeCandidates(
  all: readonly HotelSummary[],
  state: { ranked?: string[]; semantic?: string[] },
  cities: readonly Destination[],
): Candidate[] {
  const ids = new Set(cities.map((d) => d.id))
  const kept = state.ranked && new Set(state.ranked)
  const semantic = new Map((state.semantic ?? []).map((id, i) => [id, i]))
  return all
    .filter((h) => ids.has(h.destinationId) && (!kept || kept.has(h.id)))
    .sort((a, b) => (semantic.get(a.id) ?? Infinity) - (semantic.get(b.id) ?? Infinity) || b.rating - a.rating)
    .map((h) => ({ id: h.id, name: h.name }))
}

/**
 * A question about the hotel the chat is on: the model answers from the hotel's data, with its general knowledge
 * apart; on a missing key, an error or a timeout the rules answer the ready-made questions (src/lib/ai/hotelAnswer.ts).
 * A question about the places near is the geo steps' (src/lib/ai/geoTurn.ts): the model chooses the calls of the geo
 * tools, the answer tells what they found — the Ostrovok places of the hotel first, OpenStreetMap besides — with the
 * steps' lines and the map; a hotel with neither data is answered as before. A question about the view from the
 * windows («видно ли море») is the view steps' (src/lib/ai/viewTurn.ts): the lines of sight over EUBUCCO's buildings.
 * A question about the noise runs the tool «Анализ шума» (src/lib/ai/noiseTool.ts) first: the answer goes by its
 * result, and its step carries the run with the sources for the block of the feed; a signed-in user's run is written
 * to `tool_runs` (src/lib/db/toolRuns.ts).
 */
async function hotelTurn(
  hotel: Hotel,
  {
    brief,
    messages,
    signal,
    deadline,
    chatId,
    messageId,
  }: {
    brief: Brief
    messages: AssistantRequest['messages']
    signal: AbortSignal
    deadline: number
    chatId?: string
    messageId?: string
  },
): Promise<Response> {
  const next: Brief = { ...brief, hotelId: hotel.id, destinationId: hotel.destinationId }
  const text = messages[messages.length - 1].text
  const [models, details, noise, hotelier, noiseRun] = await Promise.all([
    getTextModels(),
    loadHotelDetails(hotel.id),
    loadHotelNoise(hotel),
    loadHotelierClaims(hotel.id).then((claims) => claims ?? []),
    isNoiseQuestion(text)
      ? runOwner(chatId, messageId).then((owner) =>
          recordRun(owner, NOISE_TOOL, `${hotel.name} (${hotel.id})`, () => runNoiseTool(hotel.id)),
        )
      : null,
  ])
  const steps = noiseRun ? { steps: [noiseStep(noiseRun)] } : {}
  // The noise map of the page beside the answer, from the data the answer was told from.
  const widget = noiseRun && noise ? { widget: noiseWidget(hotel, noise) } : {}
  const noiseTool = noiseRun?.result
  const geo = isHotelViewQuestion(text)
    ? await viewTurn(hotel, messages, {
        deadline,
        signal,
        details,
        date: brief.dates?.checkIn,
        models,
        onError: (id, error) => warn(`${id} did not name the place of a view question`, error),
      })
    : isHotelGeoQuestion(text)
      ? await geoTurn(hotel, messages, {
          deadline,
          signal,
          models,
          ostrovok: details?.nearby,
          onError: (id, error) => warn(`${id} did not choose the geo calls`, error),
        })
      : null
  if (geo)
    return Response.json({
      brief: next,
      reply: geo.summary,
      source: geo.planner,
      steps: geo.steps,
      ...(geo.map && { map: geo.map }),
      ...(geo.widget && { widget: geo.widget }),
      ...(geo.modelsDown && { modelsDown: true }),
    } satisfies AssistantResponse)
  let down = false
  if (models) {
    const features = (await loadHotelFeatures().catch(() => null))?.get(hotel.id)
    const result = await firstAnswer(
      models,
      (model, timeout) =>
        answerWithModel(model, { messages }, hotel, {
          dates: brief.dates,
          features,
          details,
          noise,
          noiseTool,
          hotelier,
          signal: timeout,
        }),
      {
        deadline: textDeadline(deadline),
        signal,
        onError: (id, error) => warn(`${id} failed on a hotel question`, error),
      },
    )
    if (result.ok) {
      const { answer, unverified, askHotelier } = result.value
      // The model asks the hotelier; the rules do when the traveller asks it in words and the model did not.
      const ask = askHotelier ?? ruleAsk(text)
      const asked = ask && (await askStep(hotel, ask, chatId, messageId))
      return Response.json({
        brief: next,
        reply: asked && !askHotelier ? `${answer}\n\n${ASKED_REPLY}` : answer,
        ...(unverified && { unverified }),
        source: 'model',
        ...withSteps(steps, asked),
        ...widget,
      } satisfies AssistantResponse)
    }
    down = result.failed.length > 0
    console.warn('assistant: no model answered a hotel question, using the rules')
  }
  const { answer } = ruleAnswer(text, hotel, brief.dates, details, noise, noiseTool)
  const ask = ruleAsk(text)
  const asked = ask && (await askStep(hotel, ask, chatId, messageId))
  return Response.json({
    brief: next,
    reply: asked ? `${answer}\n\n${ASKED_REPLY}` : answer,
    source: 'rules',
    ...(down && { modelsDown: true }),
    ...withSteps(steps, asked),
    ...widget,
  } satisfies AssistantResponse)
}

/** What Эвал adds when it asked the hotelier by the rules: the model says it in its own answer. */
const ASKED_REPLY = 'Спросил отельера: ответ придёт в блок «Запрос отельеру».'

/** The rules' call of «Запрос отельеру»: the traveller asks in words to ask the hotel («уточните у отеля»). */
const ruleAsk = (text: string): { question: string; keys: HotelierKey[] } | undefined =>
  asksHotelier(text) ? { question: clipText(text.trim(), 300), keys: questionKeys(text) } : undefined

/**
 * Runs «Запрос отельеру» for the signed-in traveller's chat: its run waits in `tool_runs` (`pending`), linked to the
 * request, and nothing is held open; a guest's run is an error asking to sign in. The question is the server's to
 * leave (the service role), for the user the session proved.
 */
async function askStep(
  hotel: Hotel,
  { question, keys }: { question: string; keys: HotelierKey[] },
  chatId?: string,
  messageId?: string,
): Promise<TurnStep> {
  const owner = await runOwner(chatId, messageId)
  const run = await recordRun(owner, ASK_HOTELIER_TOOL, `${hotel.name} (${hotel.id})`, async (runId) =>
    runAskHotelier(
      owner && (await serviceClient()),
      { hotelId: hotel.id, question, characteristicKeys: keys },
      { hotelName: hotel.name, traveller: owner && { userId: owner.userId, chatId: owner.chatId, runId } },
    ),
  )
  return {
    agent: 'hotelier',
    title: ASK_HOTELIER_TITLE,
    params: keys.length > 0 ? keys.map(characteristicLabel).join(', ') : hotel.name,
    status: run.result.status === 'error' ? 'failed' : 'done',
    result: clipText(run.result.summary, 300),
    run,
  }
}

/** The steps of the answer with the step of «Запрос отельеру» after them. */
const withSteps = (steps: { steps?: TurnStep[] }, asked: TurnStep | undefined) =>
  asked ? { steps: [...(steps.steps ?? []), asked] } : steps

/** The step of «Анализ шума» with its run: the block of the feed. */
const noiseStep = (run: ToolRun): TurnStep => ({
  agent: 'features',
  title: NOISE_TOOL_TITLE,
  params: NOISE_TOOL_PARAMS,
  status: run.result.status === 'error' ? 'failed' : 'done',
  result: clipText(run.result.summary, 300),
  run,
})

interface WishContext {
  messages: AssistantRequest['messages']
  brief: Brief
  today: IsoDate
  destinations: readonly Destination[]
  deadline: number
  signal: AbortSignal
  /** The signed-in user's chat and message: the runs of the tools are written to it. */
  chatId?: string
  messageId?: string
}

/**
 * Reads the traveller's newest message into the brief with the text models in turn; without a key, or when none of
 * them answered in 9 s — with the rules, so the dialog goes on either way, and Эвал says the models are down. Once the brief is complete, runs the steps
 * of the turn (`planTurn`) for the hotels (`matches`), their features and the steps' lines.
 */
async function wishTurn(context: WishContext) {
  const { messages, brief, today, destinations, deadline, signal } = context
  const input = messages[messages.length - 1].text
  // The question the client showed is the one the brief still lacks.
  const asked = nextQuestion(brief, today)?.id ?? null
  const wish = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.text)
    .join('. ')
  const found = (next: Brief) => planTurn({ brief: next, wish, today, destinations, deadline, signal }, context)

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
 * The parameters were changed by hand after «ничего не нашёл»: the hotels by the brief as it is, nothing of the
 * dialog is read again (the newest message would take back what was changed). The wish's words still lead the search.
 */
async function rerunTurn(context: WishContext) {
  const { messages, brief, today, destinations, deadline, signal } = context
  const wish = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.text)
    .join('. ')
  return {
    brief,
    source: 'rules',
    ...(await planTurn({ brief, wish, today, destinations, deadline, signal }, context)),
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
 * The traveller's newest message: about the bookings (`bookingTurn`), about the chat's hotel (`hotelTurn`), with
 * photos (`photoTurn`) or a wish (`wishTurn`).
 */
export async function POST(request: Request) {
  const ip = clientIp(request)
  if (!(await allowRequest(ip))) return apiError(429, 'Too many requests')
  const parsedBody = assistantRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) return apiError(400, 'Invalid request')

  const { messages, photos = [], rerun } = parsedBody.data
  const deadline = Date.now() + (photos.length > 0 ? PHOTO_BUDGET_MS : ANSWER_BUDGET_MS)
  const destinations = await loadDestinations().catch(() => null)
  if (!destinations) return apiError(503, 'Catalog unavailable')
  const brief = normalizeBrief(parsedBody.data.brief, destinations)
  const today = todayIso()
  const { chatId, messageId } = parsedBody.data
  // A chat about the bookings answers from the bookings of the request; the server keeps none of them.
  if (brief.trips) {
    const models = await getTextModels()
    return Response.json(
      await bookingTurn(
        { messages, brief, bookings: parsedBody.data.bookings ?? [], today, deadline, signal: request.signal },
        {
          hotels: loadHotels,
          models,
          record: recordRun,
          owner: () => runOwner(chatId, messageId),
          onError: (id, error) => warn(`${id} failed on a question about the bookings`, error),
        },
      ),
    )
  }
  // A chat about a hotel answers about it; an id the catalogue does not know is a chat like any other.
  const hotel = brief.hotelId ? await loadHotel(brief.hotelId).catch(() => undefined) : undefined
  if (brief.hotelId && !hotel) delete brief.hotelId
  if (hotel) {
    return hotelTurn(hotel, { brief, messages, signal: request.signal, deadline, chatId, messageId })
  }
  const context: WishContext = {
    messages,
    brief,
    today,
    destinations,
    deadline,
    signal: request.signal,
    chatId,
    messageId,
  }
  if (rerun) return Response.json(await rerunTurn(context))
  return Response.json(photos.length > 0 ? await photoTurn(photos, ip, context) : await wishTurn(context))
}
