import 'server-only'
import { generateText, Output, type LanguageModel } from 'ai'
import { z } from 'zod'
import type { Destination } from '../../data/destinations'
import {
  PARTY_LABEL,
  VIBE_LABEL,
  describeBrief,
  normalizeBrief,
  parseWish,
  type AssistantRequest,
  type Brief,
} from '../assistant'
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
  destinationId: optional(z.string()).describe('id города из списка, только если город назван; иначе null'),
  vibe: optional(z.string()).describe(
    'id темы из списка, по смыслу фразы; null, только если о поездке ничего не сказано',
  ),
  when: optional(z.coerce.string()).describe(
    'номер месяца "1"–"12", soon — в ближайшее время, только если сказано явно; иначе null',
  ),
  nights: optional(z.coerce.number()).describe(
    'число ночей, только если сказано явно (неделя — 7, выходные — 2); иначе null',
  ),
  party: optional(z.string()).describe('id состава из списка, только если сказано явно; иначе null'),
  mood: optional(z.string()).describe('calm — спокойно, active — активно, только если сказано явно; иначе null'),
  budget: optional(z.coerce.number()).describe('бюджет на всю поездку в рублях, целое; «недорого» без суммы — null'),
  reply: optional(z.string()).describe('одна короткая дружелюбная фраза-реакция без вопросов, до 120 символов'),
})

const list = (labels: Record<string, string>) =>
  Object.entries(labels)
    .map(([id, label]) => `${id} — ${label}`)
    .join('; ')

function instructions(brief: Brief, today: IsoDate, destinations: readonly Destination[]) {
  const known = describeBrief(brief, destinations)
  return [
    'Ты помощник сервиса путешествий «О!Погнали». Пользователь описывает поездку своими словами.',
    'Извлеки из ПОСЛЕДНЕГО сообщения пользователя только то, что в нём сказано или ясно следует по смыслу',
    '(«тепло и поплавать с маской» — море, «старинные улочки» — города Европы). Тему (vibe) определяй по смыслу; остальное не додумывай: если не сказано явно — null.',
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

/** A letter outside Cyrillic. */
export const OTHER_SCRIPT = /(?!\p{Script=Cyrillic})\p{L}/u

/**
 * Without reasoning the model fills fields the traveller never mentioned, and then the assistant skips its
 * questions. The theme and the budget are taken as they are (that is what free phrases are for); a city only
 * when it is named; who goes, the dates, the length and the mood only when the rules see them in the same text
 * (a bare number is not enough for the length: it may be the budget).
 */
function grounded(key: keyof Brief, parsed: Brief, input: string, destinations: readonly Destination[]): boolean {
  if (key === 'vibe' || key === 'budget') return true
  const text = input.toLocaleLowerCase('ru')
  if (key === 'destinationId') {
    const name = destinations.find((d) => d.id === parsed.destinationId)?.name.toLocaleLowerCase('ru') ?? ''
    return name !== '' && text.includes(name.slice(0, Math.max(4, name.length - 2)))
  }
  return parseWish(input, destinations)[key] !== undefined
}

/** Reads the newest message with the model; the cities are the `destinations`. Throws on any model error, timeout or abort. */
export async function understandWish(
  model: LanguageModel,
  { messages, brief }: AssistantRequest,
  today: IsoDate,
  destinations: readonly Destination[],
  signal?: AbortSignal,
): Promise<{ parsed: Brief; reply?: string }> {
  const timeout = AbortSignal.timeout(MODEL_TIMEOUT_MS)
  const { output } = await generateText({
    model,
    instructions: instructions(brief, today, destinations),
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
  // A remark with letters of other scripts (the model slips into Chinese or Korean) is dropped whole.
  const reply = output.reply?.trim().slice(0, 200)
  const parsed = normalizeBrief({ ...output, when }, destinations)
  const input = messages.at(-1)?.text ?? ''
  // "не важно" for the asked question is the rules' call in `foldBrief`: the model hands questions over too eagerly.
  for (const key of Object.keys(parsed) as (keyof Brief)[])
    if (parsed[key] === 'any' || !grounded(key, parsed, input, destinations)) delete parsed[key]
  return { parsed, reply: reply && !OTHER_SCRIPT.test(reply) ? reply : undefined }
}
