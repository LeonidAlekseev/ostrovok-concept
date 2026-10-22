import { z } from 'zod'
import { getAssistantModel } from '@/lib/ai/model'
import { allowRequest, clientIp } from '@/lib/ai/rateLimit'
import { SEMANTIC_TIMEOUT_MS, semanticSearch } from '@/lib/ai/semantic'
import { understandWish } from '@/lib/ai/understand'
import {
  MAX_HISTORY,
  MAX_MESSAGE_LENGTH,
  foldBrief,
  mergeBrief,
  nextQuestion,
  normalizeBrief,
  planCities,
  type AssistantResponse,
  type Brief,
} from '@/lib/assistant'
import type { Destination } from '@/data/destinations'
import type { HotelSummary } from '@/lib/catalog'
import { loadDestinations, loadHotelSummaries } from '@/lib/db/catalog'
import { todayIso, type IsoDate } from '@/lib/dates'

const requestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) }))
    .min(1)
    .max(MAX_HISTORY)
    .refine((messages) => messages.at(-1)?.role === 'user', 'The last message is the traveller’s'),
  brief: z.record(z.string(), z.unknown()).default({}),
})

/** The answer is due in 14 s: the client waits 15. The semantic search gets what the model left, if enough. */
const ANSWER_BUDGET_MS = 14_000
const MIN_SEMANTIC_MS = 1500
/** Hotels the semantic search hands to the plan. */
const MATCHES = 6

/** The hotels and the ready-made route the search by meaning finds for the plan; empty keeps the rules. */
interface Found {
  matches?: HotelSummary[]
  routeId?: string
}

/**
 * Hotels for the traveller's words — all their messages, so «тихо» from the first one still counts — in the
 * plan's cities, and the route for the same words, both at once and in the same time, once the brief is
 * complete and the plan is due; nothing found keeps the plan and the route on the rules.
 */
async function findForPlan(
  brief: Brief,
  wish: string,
  today: IsoDate,
  destinations: readonly Destination[],
  deadline: number,
  signal: AbortSignal,
): Promise<Found> {
  const timeoutMs = Math.min(deadline - Date.now(), SEMANTIC_TIMEOUT_MS)
  if (nextQuestion(brief, today) || timeoutMs < MIN_SEMANTIC_MS) return {}
  const destinationIds = planCities(brief, today, destinations).map((d) => d.id)
  const [hits, routes] = await Promise.all([
    semanticSearch(wish, { kind: 'hotel', destinationIds, k: MATCHES, timeoutMs, signal }),
    semanticSearch(wish, { kind: 'route', k: 1, timeoutMs, signal }),
  ])
  const found: Found = { routeId: routes?.[0]?.id }
  if (!hits) return found
  const summaries = new Map((await loadHotelSummaries().catch(() => [])).map((h) => [h.id, h]))
  const matches = hits.flatMap((hit) => summaries.get(hit.id) ?? [])
  return matches.length ? { ...found, matches } : found
}

/**
 * Reads the traveller's newest message into the brief with the language model; without a key, on a model
 * error or after 8 s — with the rules, so the dialog goes on either way. Once the brief is complete, adds the
 * hotels (`matches`) and the ready-made route (`routeId`) the semantic search finds for the traveller's words;
 * without them the plan and the route keep the rules.
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
  const input = messages[messages.length - 1].text
  // The question the client showed is the one the brief still lacks.
  const asked = nextQuestion(brief, today)?.id ?? null
  const wish = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.text)
    .join('. ')
  const found = (next: Brief) => findForPlan(next, wish, today, destinations, deadline, request.signal)

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
