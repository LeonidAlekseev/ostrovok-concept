import 'server-only'
import { generateText, Output, type LanguageModel } from 'ai'
import { z } from 'zod'
import type { Destination } from '../../data/destinations'
import {
  PARTY_LABEL,
  VIBE_LABEL,
  briefWithStay,
  describeBrief,
  normalizeBrief,
  parseWish,
  stayDates,
  type AssistantRequest,
  type Brief,
  type StayDates,
} from '../assistant'
import { addDays, nightsBetween, type IsoDate } from '../dates'
import { VIEW_LABEL } from '../features'

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
  checkIn: optional(z.string()).describe('дата заезда YYYY-MM-DD, только если назван день; иначе null'),
  checkOut: optional(z.string()).describe('дата выезда YYYY-MM-DD, только если назван день; иначе null'),
  nights: optional(z.coerce.number()).describe(
    'число ночей, только если сказано явно (неделя — 7, выходные — 2); иначе null',
  ),
  party: optional(z.string()).describe('id состава из списка, только если сказано явно; иначе null'),
  mood: optional(z.string()).describe('calm — спокойно, active — активно, только если сказано явно; иначе null'),
  budget: optional(z.coerce.number()).describe('бюджет на всю поездку в рублях, целое; «недорого» без суммы — null'),
  quiet: optional(z.boolean()).describe(
    'true — просят тишину, чтобы ночью не шумело («тихий», «а потише?»); иначе null',
  ),
  height: optional(z.string()).describe(
    'high — здание повыше или высокий этаж («а повыше?»), low — пониже, только если сказано; иначе null',
  ),
  view: optional(z.string()).describe(
    'вид из окна номера: id вида из списка, any — «с видом» без уточнения; иначе null',
  ),
  reply: optional(z.string()).describe('одна короткая дружелюбная фраза-реакция без вопросов, до 120 символов'),
})

const list = (labels: Record<string, string>) =>
  Object.entries(labels)
    .map(([id, label]) => `${id} — ${label}`)
    .join('; ')

function instructions(brief: Brief, today: IsoDate, destinations: readonly Destination[]) {
  const known = describeBrief(brief, destinations)
  return [
    'Ты помощник сервиса путешествий «О!бъективно». Пользователь описывает поездку своими словами.',
    'Извлеки из ПОСЛЕДНЕГО сообщения пользователя только то, что в нём сказано или ясно следует по смыслу',
    '(«тепло и поплавать с маской» — море, «старинные улочки» — города Европы). Тему (vibe) определяй по смыслу; остальное не додумывай: если не сказано явно — null.',
    'Предыдущие сообщения — контекст для коротких ответов на вопрос помощника.',
    'Уточнения («а повыше?», «а потише?») дополняют прежние условия: верни только то, что сказано в последнем сообщении.',
    'Даты: «с 10 по 15 ноября», «10–15.11», «на выходные 14–16 ноября» — checkIn и checkOut в YYYY-MM-DD; год — ближайший не прошедший. «а с 12-го?» — только checkIn, выезд возьмём по прежней длительности.',
    `Сегодня ${today}.`,
    `Темы (vibe): ${list(VIBE_LABEL)}.`,
    `Состав (party): ${list(PARTY_LABEL)}.`,
    `Вид из окна (view): ${list(VIEW_LABEL)}.`,
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
 * when it is named; who goes, the dates, the length, the mood and the hotel's criteria (quiet, height, view) only
 * when the rules see them in the same text (a bare number is not enough for the length: it may be the budget).
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

/**
 * The days the model read from the message: a check-in or check-out it named, or only the length of the stay the
 * brief has. The one it leaves out comes from the brief's stay. A stay that is past, impossible or of unknown
 * length is `rejected`: Эвал asks for the days.
 */
function namedStay(
  { checkIn, checkOut, nights }: { checkIn: string | null; checkOut: string | null; nights: number | null },
  brief: Brief,
  today: IsoDate,
): { dates: StayDates } | { rejected: true } | undefined {
  if (!checkIn && !checkOut && !(nights && brief.dates)) return undefined
  const start = checkIn ?? brief.dates?.checkIn
  const length = nights ?? (brief.dates ? nightsBetween(brief.dates.checkIn, brief.dates.checkOut) : brief.nights)
  const end = checkOut ?? (start && length ? addDays(start, length) : undefined)
  const dates = stayDates(start, end)
  return dates && dates.checkIn >= today ? { dates } : { rejected: true }
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
    // A one-shot extraction: thinking only spends the 8 seconds (`reasoning_effort: none` in the request).
    reasoning: 'none',
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
  // A view `any` is «с видом», not a handed-over question.
  for (const key of Object.keys(parsed) as (keyof Brief)[])
    if ((parsed[key] === 'any' && key !== 'view') || !grounded(key, parsed, input, destinations)) delete parsed[key]
  // Days are taken only when the message names them: a day number or a month (a guess at them is not).
  if (/\d/.test(input) || typeof parseWish(input, destinations).when === 'number') {
    const named = namedStay(output, brief, today)
    if (named && 'dates' in named) Object.assign(parsed, briefWithStay(named.dates))
    else if (named) parsed.datesRejected = true
  }
  return { parsed, reply: reply && !OTHER_SCRIPT.test(reply) ? reply : undefined }
}
