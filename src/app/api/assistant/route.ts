import { z } from 'zod'
import { getAssistantModel } from '@/lib/ai/model'
import { allowRequest, clientIp } from '@/lib/ai/rateLimit'
import { understandWish } from '@/lib/ai/understand'
import {
  MAX_HISTORY,
  MAX_MESSAGE_LENGTH,
  foldBrief,
  mergeBrief,
  nextQuestion,
  normalizeBrief,
  type AssistantResponse,
} from '@/lib/assistant'
import { todayIso } from '@/lib/dates'

const requestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) }))
    .min(1)
    .max(MAX_HISTORY)
    .refine((messages) => messages.at(-1)?.role === 'user', 'The last message is the traveller’s'),
  brief: z.record(z.string(), z.unknown()).default({}),
})

/**
 * Reads the traveller's newest message into the brief with the language model; without a key, on a model
 * error or after 8 s — with the rules, so the dialog goes on either way.
 */
export async function POST(request: Request) {
  if (!allowRequest(clientIp(request))) return Response.json({ error: 'Too many requests' }, { status: 429 })
  const parsedBody = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) return Response.json({ error: 'Invalid request' }, { status: 400 })

  const { messages } = parsedBody.data
  const brief = normalizeBrief(parsedBody.data.brief)
  const today = todayIso()
  const input = messages[messages.length - 1].text
  // The question the client showed is the one the brief still lacks.
  const asked = nextQuestion(brief, today)?.id ?? null

  const model = await getAssistantModel()
  if (model) {
    try {
      const { parsed, reply } = await understandWish(model, { messages, brief }, today, request.signal)
      return Response.json({
        brief: foldBrief(brief, parsed, input, asked),
        reply,
        source: 'model',
      } satisfies AssistantResponse)
    } catch (error) {
      // The kind and the provider's short message; never the request itself.
      const reason = error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : String(error)
      console.warn(`assistant: model failed, using the rules (${reason})`)
    }
  }
  return Response.json({ brief: mergeBrief(brief, input, asked), source: 'rules' } satisfies AssistantResponse)
}
