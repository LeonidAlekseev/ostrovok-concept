import 'server-only'
import { generateText, Output, type LanguageModel } from 'ai'
import { z } from 'zod'
import { destinations } from '../../data/destinations'
import { PARTY_LABEL, VIBE_LABEL, describeBrief, normalizeBrief, type AssistantRequest, type Brief } from '../assistant'
import type { IsoDate } from '../dates'

/** One attempt: after this the route answers with the rules. */
export const MODEL_TIMEOUT_MS = 8000

/** A field the message may leave out; a wrong type is dropped instead of failing the whole answer. */
const optional = <T extends z.ZodType>(schema: T) => schema.nullable().catch(null)

/**
 * What the newest message says. Loose on purpose: a value outside the lists is dropped by `normalizeBrief`
 * instead of failing the whole answer.
 */
const wishSchema = z.object({
  destinationId: optional(z.string()).describe('id города из списка, если город назван или очевиден; иначе null'),
  vibe: optional(z.string()).describe('id темы из списка; иначе null'),
  when: optional(z.coerce.string()).describe('номер месяца "1"–"12", soon — в ближайшее время; иначе null'),
  nights: optional(z.coerce.number()).describe('число ночей; неделя — 7, выходные — 2; иначе null'),
  party: optional(z.string()).describe('id состава из списка, только если сказано, с кем едет; иначе null'),
  mood: optional(z.string()).describe('calm — спокойно, active — активно, только если сказано прямо; иначе null'),
  budget: optional(z.coerce.number()).describe('бюджет на всю поездку в рублях, целое; «недорого» без суммы — null'),
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
    '(«тепло и поплавать с маской» — море, «старинные улочки» — города Европы). Не додумывай: чего нет — null.',
    'Предыдущие сообщения — контекст для коротких ответов на вопрос помощника.',
    `Сегодня ${today}.`,
    `Темы (vibe): ${list(VIBE_LABEL)}.`,
    `Состав (party): ${list(PARTY_LABEL)}.`,
    `Города каталога (destinationId — только из этого списка): ${destinations.map((d) => `${d.id} — ${d.name}`).join('; ')}.`,
    known ? `Уже понято: ${known}.` : 'Пока ничего не понято.',
    // The model gets the field names from `response_format`, but not their descriptions: they go here.
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
    // A one-shot extraction: thinking only spends the 8 seconds. OpenRouter takes it as a provider option,
    // the SDK's own `reasoning` does not reach the request.
    providerOptions: { openrouter: { reasoning: { effort: 'none' } } },
    maxRetries: 0,
    abortSignal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  const month = Number(output.when)
  const when = Number.isInteger(month) && month >= 1 && month <= 12 ? month - 1 : output.when
  const reply = output.reply?.trim().slice(0, 200)
  const parsed = normalizeBrief({ ...output, when })
  // Without reasoning the model makes cities up; keep one only when its name (any case ending) is in the message.
  const city = destinations.find((d) => d.id === parsed.destinationId)
  const input = messages.at(-1)?.text.toLocaleLowerCase('ru') ?? ''
  if (city && !input.includes(city.name.toLocaleLowerCase('ru').slice(0, Math.max(4, city.name.length - 2))))
    delete parsed.destinationId
  // The model hands questions over too eagerly; "не важно" for the asked question is the rules' call in `foldBrief`.
  for (const key of Object.keys(parsed) as (keyof Brief)[]) if (parsed[key] === 'any') delete parsed[key]
  return { parsed, reply: reply || undefined }
}
