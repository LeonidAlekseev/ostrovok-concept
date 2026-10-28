import 'server-only'
import { generateText, type LanguageModel } from 'ai'
import { isRussian } from './hotelAnswer'
import { REPLY_STYLE } from './style'

/**
 * Эвал's remark over the facts of a geo answer (src/lib/ai/geoTurn.ts): the facts — the places, the distances, the
 * routes — are written by rules, the fast models used to change the numbers; a model adds one short sentence over
 * them, a conclusion or a piece of advice, and the code keeps it only when it says no number, no unit and no name the
 * facts do not have, advises no walk the facts have no route on foot for, in Russian. Otherwise the facts answer
 * alone.
 */

/** A remark is a sentence: longer is not short. */
export const MAX_REMARK_LENGTH = 200
const MIN_REMARK_LENGTH = 8

const instructions = (hotel: string) =>
  [
    `Ты Эвал, помощник по отелю «${hotel}» в Валенсии. Гость спросил о местах рядом, ответ с фактами ему уже показан.`,
    'Добавь к нему одну короткую фразу на русском (до 15 слов) — вывод или практичный совет, который следует из',
    'фактов: можно ли дойти пешком или удобнее такси, есть ли из чего выбрать. Грамотно, на «вы», просто и по делу,',
    'без общих слов. Без цифр и чисел, без расстояний, времени и единиц измерения; не называй мест и не повторяй',
    'факты. Только сама фраза, без кавычек и пояснений.',
    REPLY_STYLE,
  ].join(' ')

/** The model's sentence over `facts`; throws on an empty answer, so the next model of the chain is asked. */
export async function modelRemark(
  model: LanguageModel,
  hotel: { name: string },
  question: string,
  facts: string,
  signal: AbortSignal,
): Promise<string> {
  const { text } = await generateText({
    model,
    instructions: instructions(hotel.name),
    prompt: `Вопрос гостя: ${question}\nОтвет с фактами:\n${facts}`,
    reasoning: 'none',
    maxOutputTokens: 120,
    maxRetries: 0,
    abortSignal: signal,
  })
  if (!text.trim()) throw new Error('The model gave no remark')
  return text
}

/** A digit, a sign of money or of a share: a number of its own. */
const DIGITS = /[\p{N}%€$]/u
/** The words of numbers and their forms: «два», «пять», «полчаса», «пару», «сотня». */
const NUMBER_WORDS =
  /(?<!\p{L})(?:од(?:ин|на|но|ну|ного|ной|ному|ном)|дв(?:а|е|ух|ум|умя)|тр(?:и|ех|ём|ем|емя)|четыр\p{L}*|пят(?:ь|и|ью|ок|ка)|шест(?:ь|и|ью)|сем(?:ь|и|ью)|восем\p{L}*|девят\p{L}*|десят\p{L}*|\p{L}+дцат\p{L}*|сорок\p{L}*|девяност\p{L}*|сто|ста|сотн\p{L}*|тысяч\p{L}*|миллион\p{L}*|полтор\p{L}*|полчаса|получаса|пар(?:а|у|ы|е|ой)|половин\p{L}*|дюжин\p{L}*)(?!\p{L})/iu
/** The units of a distance or a time: «м», «км», «минут», «часа», «кварталов», «шагах». */
const UNITS =
  /(?<!\p{L})(?:м|км|мин|ч|сек|(?:кило)?метр(?:а|ов|ах|ам|ами|е|у|ом)?|минут\p{L}*|секунд\p{L}*|час|часа|часов|часу|часам|квартал\p{L}*|шаг|шага|шагов|шагах|шагу)(?!\p{L})/iu

/** A walk the remark advises: the facts must have a route on foot. */
const WALK = /пешк|дойти|дойдет|дойдёт|прогул/iu

const words = (text: string) => text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []
const lower = (text: string) => text.toLocaleLowerCase('ru').replace(/ё/g, 'е')

/** A word the facts have, in another form too: «Валенсии» of «Валенсия». */
function known(word: string, facts: readonly string[]): boolean {
  const w = lower(word)
  return facts.some((f) => {
    if (f === w) return true
    let common = 0
    while (common < Math.min(f.length, w.length) && f[common] === w[common]) common += 1
    return common >= 4 && common >= Math.max(f.length, w.length) - 2
  })
}

/**
 * The names of a remark: the quoted ones, the Latin words and the words with a capital letter after the first —
 * a place, a street, a brand.
 */
function names(text: string): string[] {
  const quoted = [...text.matchAll(/[«"“]([^»"”]+)[»"”]/gu)].map((m) => m[1])
  const latin = words(text).filter((w) => /\p{Script=Latin}/u.test(w))
  const capital = words(text)
    .slice(1)
    .filter((w) => /^\p{Lu}/u.test(w))
  return [...quoted.flatMap(words), ...latin, ...capital]
}

/**
 * The remark when it passes the checks: one sentence in Russian, short, without a number, a unit or a name the
 * facts do not have, without a walk when the facts have no route on foot; `undefined` otherwise.
 */
export function checkedRemark(remark: string, facts: string): string | undefined {
  const text = remark
    .trim()
    .replace(/^[«"“'](.*)[»"”']$/su, '$1')
    .trim()
  if (text.length < MIN_REMARK_LENGTH || text.length > MAX_REMARK_LENGTH || /[\n•]/.test(text)) return undefined
  if ((text.replace(/[.!?…]+$/u, '').match(/[.!?…](?=\s|$)/gu) ?? []).length > 0) return undefined
  if (!isRussian(text) || DIGITS.test(text) || NUMBER_WORDS.test(text) || UNITS.test(text)) return undefined
  if (WALK.test(text) && !/пешком/u.test(facts)) return undefined
  const factWords = words(facts).map(lower)
  if (!names(text).every((name) => known(name, factWords))) return undefined
  return /[.!?…]$/u.test(text) ? text : `${text}.`
}
