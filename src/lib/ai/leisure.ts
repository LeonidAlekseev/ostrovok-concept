import 'server-only'
import { generateText, Output, type LanguageModel } from 'ai'
import { z } from 'zod'
import { formatLongDate, type IsoDate } from '../dates'
import { leisureFields, type LeisureFields, type TripLeisure } from '../trip'
import { MODEL_TIMEOUT_MS, OTHER_SCRIPT } from './understand'

/** The model suggests this many alternatives of a leisure item. */
export const ALTERNATIVES = 3

/** Loose on purpose: a malformed option is dropped instead of failing the whole answer. */
const answerSchema = z.object({
  options: z
    .array(
      z.object({
        title: z.string().describe('название по-русски, до 80 символов'),
        category: z.string().describe('категория по-русски одним-двумя словами: музей, концерт, прогулка, ресторан…'),
        minutes: z.coerce.number().describe('длительность в минутах, целое, 30–480'),
        price: z.coerce.number().describe('цена на двоих в рублях, целое; 0 — бесплатно'),
      }),
    )
    .describe(`ровно ${ALTERNATIVES} варианта`),
})

export interface LeisureRequest {
  city: string
  /** 1 is the arrival day. */
  day: number
  date: IsoDate
  current: TripLeisure
  /** The other leisure of the plan: not to be suggested again. */
  taken: readonly string[]
}

function instructions({ city, day, date, current, taken }: LeisureRequest) {
  return [
    'Ты помощник сервиса путешествий «О!Погнали». Пользователь меняет пункт досуга в плане поездки.',
    `Город: ${city}. День поездки ${day}, ${formatLongDate(date)}, начало в ${current.time}.`,
    `Сейчас в плане: «${current.title}» (${current.category}, ${current.minutes ?? 120} мин, ${current.price} ₽).`,
    taken.length ? `Уже есть в плане, не предлагай: ${taken.map((title) => `«${title}»`).join(', ')}.` : '',
    `Предложи ${ALTERNATIVES} других реальных занятия в этом городе на то же время: разные по характеру, но близкие по длительности и цене.`,
    'Пиши только по-русски кириллицей, без латиницы; названия мест — в русском написании.',
    // The model gets the field names from `response_format`, but not their descriptions: they go here.
    `Отвечай только JSON по схеме: ${JSON.stringify(z.toJSONSchema(answerSchema))}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Alternatives of a leisure item from the model: `ALTERNATIVES` options in Cyrillic, rounded to the limits of
 * the plan. Throws on a model error, a timeout of 8 s, an abort or too few usable options.
 */
export async function suggestLeisure(
  model: LanguageModel,
  request: LeisureRequest,
  signal?: AbortSignal,
): Promise<LeisureFields[]> {
  const timeout = AbortSignal.timeout(MODEL_TIMEOUT_MS)
  const { output } = await generateText({
    model,
    instructions: instructions(request),
    prompt: 'Предложи варианты.',
    output: Output.object({ schema: answerSchema }),
    // As the assistant: thinking only spends the 8 seconds; OpenRouter takes it as a provider option.
    providerOptions: { openrouter: { reasoning: { effort: 'none' } } },
    maxRetries: 0,
    abortSignal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  const seen = new Set([request.current.title, ...request.taken].map((title) => title.toLocaleLowerCase('ru')))
  const options = output.options.flatMap((option) => {
    const parsed = leisureFields.safeParse({
      title: option.title.trim().slice(0, 120),
      category: option.category.trim().slice(0, 60),
      minutes: Math.round(Math.min(480, Math.max(30, option.minutes)) / 15) * 15,
      price: Math.round(Math.max(0, option.price) / 50) * 50,
    })
    if (!parsed.success) return []
    const { title, category } = parsed.data
    // Letters of other scripts (the model slips into Latin or Chinese) drop the option whole.
    if (OTHER_SCRIPT.test(title) || OTHER_SCRIPT.test(category)) return []
    const key = title.toLocaleLowerCase('ru')
    if (seen.has(key)) return []
    seen.add(key)
    return [parsed.data]
  })
  if (options.length < ALTERNATIVES) throw new Error(`leisure: ${options.length} usable options of ${ALTERNATIVES}`)
  return options.slice(0, ALTERNATIVES)
}
