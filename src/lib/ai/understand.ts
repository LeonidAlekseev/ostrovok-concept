import 'server-only'
import { generateText, Output, type LanguageModel } from 'ai'
import { z } from 'zod'
import { destinations } from '../../data/destinations'
import { PARTY_LABEL, VIBE_LABEL, describeBrief, normalizeBrief, type AssistantRequest, type Brief } from '../assistant'
import type { IsoDate } from '../dates'

/** One attempt: after this the route answers with the rules. */
export const MODEL_TIMEOUT_MS = 8000

/** Not `nullable`: Minimax rejects `type: [..., "null"]` in the schema. A `null` or a wrong type is dropped instead. */
const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined)

/**
 * What the newest message says. Loose on purpose: a value outside the lists is dropped by `normalizeBrief`
 * instead of failing the whole answer.
 */
const wishSchema = z.object({
  destinationId: optional(z.string()).describe(
    'id города из списка, если город назван или очевиден; иначе не указывай',
  ),
  vibe: optional(z.string()).describe('id темы из списка, any — «удиви меня», «не важно»; иначе не указывай'),
  when: optional(z.coerce.string()).describe(
    'номер месяца "1"–"12", soon — в ближайшее время, any — «не важно»; иначе не указывай',
  ),
  nights: optional(z.coerce.number()).describe('число ночей; неделя — 7, выходные — 2; иначе не указывай'),
  party: optional(z.string()).describe('id состава из списка, any — «не важно»; иначе не указывай'),
  mood: optional(z.string()).describe('calm — спокойно, active — активно; иначе не указывай'),
  budget: optional(z.coerce.number()).describe(
    'бюджет на всю поездку в рублях, целое; «недорого» без суммы — не указывай',
  ),
  reply: optional(z.string()).describe('одна короткая дружелюбная фраза-реакция без вопросов, до 120 символов'),
})

const list = (labels: Record<string, string>) =>
  Object.entries(labels)
    .map(([id, label]) => `${id} — ${label}`)
    .join('; ')

function instructions(brief: Brief, today: IsoDate) {
  const known = describeBrief(brief)
  return [
    'Ты помощник сервиса путешествий «О!Погнали». Пользователь описывает поездку своими словами.',
    'Извлеки из ПОСЛЕДНЕГО сообщения пользователя только то, что в нём сказано или ясно следует по смыслу',
    '(«тепло и поплавать с маской» — море, «старинные улочки» — города Европы). Не додумывай: чего нет — не указывай поле.',
    'Предыдущие сообщения — контекст для коротких ответов на вопрос помощника.',
    `Сегодня ${today}.`,
    `Темы (vibe): ${list(VIBE_LABEL)}.`,
    `Состав (party): ${list(PARTY_LABEL)}.`,
    `Города каталога (destinationId — только из этого списка): ${destinations.map((d) => `${d.id} — ${d.name}`).join('; ')}.`,
    known ? `Уже понято: ${known}.` : 'Пока ничего не понято.',
    // Minimax does not see the schema of `response_format`, so it goes into the prompt too.
    `Отвечай только JSON по схеме: ${JSON.stringify(z.toJSONSchema(wishSchema))}`,
  ].join('\n')
}

/** Reads the newest message with the model. Throws on any model error, timeout or abort. */
export async function understandWish(
  model: LanguageModel,
  { messages, brief }: AssistantRequest,
  today: IsoDate,
  signal?: AbortSignal,
): Promise<{ parsed: Brief; reply?: string }> {
  const timeout = AbortSignal.timeout(MODEL_TIMEOUT_MS)
  const { output } = await generateText({
    model,
    instructions: instructions(brief, today),
    messages: messages.map(({ role, text }) => ({ role, content: text })),
    output: Output.object({ schema: wishSchema }),
    // A one-shot extraction: thinking only spends the 8 seconds.
    reasoning: 'none',
    maxRetries: 0,
    abortSignal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  const month = Number(output.when)
  const when = Number.isInteger(month) && month >= 1 && month <= 12 ? month - 1 : output.when
  const reply = output.reply?.trim().slice(0, 200)
  return { parsed: normalizeBrief({ ...output, when }), reply: reply || undefined }
}
