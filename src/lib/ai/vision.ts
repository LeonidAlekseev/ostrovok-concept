import 'server-only'
import { generateText, Output, type LanguageModel } from 'ai'
import { z } from 'zod'
import { MAX_PHOTOS, PHOTO_REFINE, PHOTO_SIMILAR, PHOTO_TEXT } from '../assistant'
import { VIEW_LABEL, type ViewKind } from '../features'
import { isRussian } from './hotelAnswer'

/**
 * The photos of the chat. What the traveller wants of them (`photoIntent`): the hotels like the photo, or what the
 * photo shows added to the wish; then what is on them (`seePhotos`) by the model that sees photos
 * (`VISION_MODEL`). Its answer is in Russian or not taken; the place only when the model recognises it.
 */

export type PhotoIntent = 'similar' | 'refine' | 'unclear'

/** The model that sees photos gets this long; the route answers with the honest «не смог рассмотреть» after it. */
export const VISION_TIMEOUT_MS = 12_000
/** The model that reads the intent is quick: a message of a few words. */
const INTENT_TIMEOUT_MS = 5000
/** A data URL of an optimised photo (1600 px WebP of about 300 KB) is far under this. */
export const MAX_PHOTO_URL_LENGTH = 1_400_000
/** The photos the browser optimised: WebP, or JPEG where the browser cannot encode WebP. */
export const PHOTO_DATA_URL = /^data:image\/(?:webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/

/** Cyrillic-aware word start: `\b` only knows ASCII letters. */
const word = (stem: string) => new RegExp(`(?<![а-яё])(?:${stem})`)
const SIMILAR = word(
  'похож|такой же|такое же|такие же|таком же|наподоби|подобн|аналог|как на (?:фото|снимк|картинк)|как здесь|как тут|найди так|найди этот|найди это',
)
const REFINE = word(
  'учти|учесть|учитыва|добав|такой вид|таким видом|такого вида|такой пляж|такой бассейн|чтобы был|чтобы было|по фото|что на фото',
)

const normalize = (text: string) => text.toLocaleLowerCase('ru').replace(/\s+/g, ' ').trim()

/** What the message's words say about the photos; `unclear` for none or for words the rules do not know. */
export function photoIntent(text: string): PhotoIntent {
  const line = normalize(text)
  if (!line || line === normalize(PHOTO_TEXT)) return 'unclear'
  if (line === normalize(PHOTO_SIMILAR) || SIMILAR.test(line)) return 'similar'
  if (line === normalize(PHOTO_REFINE) || REFINE.test(line)) return 'refine'
  return 'unclear'
}

const intentSchema = z.object({
  intent: z
    .enum(['similar', 'refine', 'unclear'])
    .catch('unclear')
    .describe('similar — найти похожие отели; refine — учесть фото в запросе; unclear — непонятно'),
})

/**
 * The intent of words the rules do not know («а вот так можно?») by the text model. Throws on a model error, a
 * timeout or an abort: the route then asks.
 */
export async function modelPhotoIntent(
  model: LanguageModel,
  text: string,
  { signal, timeoutMs = INTENT_TIMEOUT_MS }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<PhotoIntent> {
  const timeout = AbortSignal.timeout(Math.min(timeoutMs, INTENT_TIMEOUT_MS))
  const { output } = await generateText({
    model,
    instructions: [
      'Пользователь сервиса путешествий приложил к сообщению фото. Определи по тексту сообщения, что он хочет.',
      'similar — найти отели, похожие на фото («хочу такой же», «есть что-то подобное?»);',
      'refine — учесть увиденное на фото в своём запросе («хочу с таким видом», «чтобы был такой бассейн»);',
      'unclear — из текста не ясно. Если сомневаешься — unclear.',
      `Отвечай только JSON по схеме: ${JSON.stringify(z.toJSONSchema(intentSchema))}`,
    ].join('\n'),
    prompt: text,
    output: Output.object({ schema: intentSchema }),
    reasoning: 'none',
    maxRetries: 0,
    abortSignal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  return output.intent
}

/** What the photos show, in Russian. */
export interface PhotoSight {
  /** A sentence or two: the style, the view, the surroundings. */
  description: string
  /** The window's view, when the photo is of one. */
  view?: ViewKind
  /** What matters for a hotel: «вид на море», «бассейн», «старый город». */
  features: string[]
  /** The city or the region, only when recognisable. */
  place?: string
}

const sightSchema = z.object({
  description: z
    .string()
    .describe('1–2 предложения по-русски: стиль, вид, окружение, что важно для выбора отеля; без выдумок'),
  view: z
    .string()
    .nullable()
    .catch(null)
    .describe(`вид из окна, если фото из окна или с балкона: ${Object.keys(VIEW_LABEL).join(', ')}; иначе null`),
  features: z
    .array(z.string())
    .catch([])
    .describe('до 6 коротких признаков по-русски для поиска отеля: «вид на море», «бассейн», «старый город»'),
  place: z
    .string()
    .nullable()
    .catch(null)
    .describe('город или регион по-русски, только если его точно можно узнать; иначе null'),
})

const MAX_DESCRIPTION = 400
const MAX_FEATURES = 6
const MAX_FEATURE = 40
const MAX_PLACE = 60

const russian = (value: string | null | undefined, max: number): string | undefined => {
  const text = value?.replace(/\s+/g, ' ').trim().slice(0, max)
  return text && isRussian(text) ? text : undefined
}

/** The base64 and the type of a photo's data URL. */
function imagePart(url: string) {
  const [head, data] = url.split(',', 2)
  return { type: 'image' as const, image: data, mediaType: head.slice('data:'.length, head.indexOf(';')) }
}

/**
 * What the photos show, by the model that sees photos. Throws on a model error, a timeout, an abort or an answer
 * without a Russian description: the route then says it could not look at them.
 */
export async function seePhotos(
  model: LanguageModel,
  photos: readonly string[],
  { signal, timeoutMs = VISION_TIMEOUT_MS }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<PhotoSight> {
  const timeout = AbortSignal.timeout(Math.min(timeoutMs, VISION_TIMEOUT_MS))
  const { output } = await generateText({
    model,
    instructions: [
      'Ты Эвал, помощник сервиса путешествий «О!бъективно». Пользователь приложил фото, чтобы подобрать отель.',
      'Опиши по-русски, что на фото важно для выбора отеля: стиль, вид, вода, бассейн, пляж, горы, старый город, окружение.',
      'Не выдумывай: город называй, только если он точно узнаваем по фото; иначе place — null.',
      `Отвечай только JSON по схеме: ${JSON.stringify(z.toJSONSchema(sightSchema))}`,
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          ...photos.slice(0, MAX_PHOTOS).map(imagePart),
          { type: 'text', text: 'Что на этих фото важно для выбора отеля?' },
        ],
      },
    ],
    output: Output.object({ schema: sightSchema }),
    reasoning: 'none',
    maxRetries: 0,
    abortSignal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  const description = russian(output.description, MAX_DESCRIPTION)
  if (!description) throw new Error('The model gave no description of the photos')
  const view = output.view && Object.hasOwn(VIEW_LABEL, output.view) ? (output.view as ViewKind) : undefined
  const features = [
    ...new Set(output.features.flatMap((feature) => russian(feature, MAX_FEATURE)?.toLocaleLowerCase('ru') ?? [])),
  ].slice(0, MAX_FEATURES)
  const place = russian(output.place, MAX_PLACE)
  return { description, ...(view && { view }), features, ...(place && { place }) }
}

/** The view as the rules of the wish read it: «вид на море». */
const viewPhrase = (view: ViewKind | undefined) => (view && view !== 'street' ? `вид ${VIEW_LABEL[view]}` : undefined)

/** The words the search by meaning looks for: the photo's description and its features. */
export const similarQuery = (sight: PhotoSight): string =>
  [sight.description, viewPhrase(sight.view), ...sight.features, sight.place]
    .flatMap((part) => part?.replace(/[.!?…]+$/, '') || [])
    .join('. ')

/** «вид на море, бассейн, Валенсия»: what the photo adds to the wish, short. */
export const sightFeatures = (sight: PhotoSight): string =>
  [...new Set([viewPhrase(sight.view), ...sight.features, sight.place].filter(Boolean))].join(', ')

/** The traveller's words with what the photo shows, marked «по фото», for the reading of the wish. */
export function refinedText(text: string, sight: PhotoSight): string {
  const seen = sightFeatures(sight) || sight.description
  // The quick reply and the stand-in of a message of photos only are not the traveller's words.
  const own = [PHOTO_REFINE, PHOTO_TEXT].some((label) => normalize(label) === normalize(text)) ? '' : text.trim()
  return [own, `По фото: ${seen}`].filter(Boolean).join('. ')
}
