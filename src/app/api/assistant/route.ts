import { z } from 'zod'
import { answerWithModel, ruleAnswer } from '@/lib/ai/hotelAnswer'
import { getAssistantModel } from '@/lib/ai/model'
import { allowRequest, clientIp } from '@/lib/ai/rateLimit'
import { runTurn, type TurnContext } from '@/lib/ai/turn'
import { MODEL_TIMEOUT_MS, understandWish } from '@/lib/ai/understand'
import {
  MAX_HISTORY,
  MAX_MESSAGE_LENGTH,
  foldBrief,
  mergeBrief,
  nextQuestion,
  normalizeBrief,
  type AssistantRequest,
  type AssistantResponse,
  type Brief,
} from '@/lib/assistant'
import type { HotelSummary } from '@/lib/catalog'
import { loadDestinations, loadHotel, loadHotelSummaries } from '@/lib/db/catalog'
import { loadHotelFeatures } from '@/lib/db/features'
import { todayIso } from '@/lib/dates'
import type { Hotel } from '@/lib/catalog'

const requestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) }))
    .min(1)
    .max(MAX_HISTORY)
    .refine((messages) => messages.at(-1)?.role === 'user', 'The last message is the traveller’s'),
  brief: z.record(z.string(), z.unknown()).default({}),
})

/** The answer is due in 14 s: the client waits 15. The steps of the turn get what the model left. */
const ANSWER_BUDGET_MS = 14_000

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

/**
 * Reads the traveller's newest message into the brief with the language model; without a key, on a model
 * error or after 8 s — with the rules, so the dialog goes on either way. Once the brief is complete, runs the steps
 * of the turn (`planTurn`) for the hotels (`matches`), their features and the steps' lines.
 */
export async function POST(request: Request) {
  const deadline = Date.now() + ANSWER_BUDGET_MS
  if (!allowRequest(clientIp(request))) return Response.json({ error: 'Too many requests' }, { status: 429 })
  const parsedBody = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) return Response.json({ error: 'Invalid request' }, { status: 400 })

  const { messages } = parsedBody.data
  const destinations = await loadDestinations().catch(() => null)
  if (!destinations) return Response.json({ error: 'Catalog unavailable' }, { status: 503 })
  const brief = normalizeBrief(parsedBody.data.brief, destinations)
  const today = todayIso()
  // A chat about a hotel answers about it; an id the catalogue does not know is a chat like any other.
  const hotel = brief.hotelId ? await loadHotel(brief.hotelId).catch(() => undefined) : undefined
  if (brief.hotelId && !hotel) delete brief.hotelId
  if (hotel) return hotelTurn(hotel, { brief, messages, signal: request.signal, deadline })
  const input = messages[messages.length - 1].text
  // The question the client showed is the one the brief still lacks.
  const asked = nextQuestion(brief, today)?.id ?? null
  const wish = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.text)
    .join('. ')
  const found = (next: Brief) => planTurn({ brief: next, wish, today, destinations, deadline, signal: request.signal })

  const model = await getAssistantModel()
  if (model) {
    try {
      const { parsed, reply } = await understandWish(model, { messages, brief }, today, destinations, request.signal)
      const next = foldBrief(brief, parsed, input, asked)
      return Response.json({
        brief: next,
        reply,
        source: 'model',
        ...(await found(next)),
      } satisfies AssistantResponse)
    } catch (error) {
      // The kind and the provider's short message; never the request itself.
      const reason = error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : String(error)
      console.warn(`assistant: model failed, using the rules (${reason})`)
    }
  }
  const next = mergeBrief(brief, input, asked, destinations)
  return Response.json({
    brief: next,
    source: 'rules',
    ...(await found(next)),
  } satisfies AssistantResponse)
}
