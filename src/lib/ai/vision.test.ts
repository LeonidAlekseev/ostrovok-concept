import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { PHOTO_REFINE, PHOTO_SIMILAR, PHOTO_TEXT } from '../assistant'
import {
  PHOTO_DATA_URL,
  modelPhotoIntent,
  photoIntent,
  refinedText,
  seePhotos,
  sightFeatures,
  similarQuery,
} from './vision'

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
}
const modelSays = (fields: Record<string, unknown>) =>
  new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text' as const, text: JSON.stringify(fields) }],
      finishReason: { unified: 'stop' as const, raw: undefined },
      usage,
      warnings: [],
    },
  })

const photo = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4'

// assistant-search, Requirement: Что сделать с фото
describe('photoIntent', () => {
  it('reads a clear wish at once (Scenario: Понятный текст)', () => {
    expect(photoIntent('найди похожий отель')).toBe('similar')
    expect(photoIntent('Хочу такой же')).toBe('similar')
    expect(photoIntent('есть что-то подобное?')).toBe('similar')
    expect(photoIntent(PHOTO_SIMILAR)).toBe('similar')
    expect(photoIntent('хочу такой вид')).toBe('refine')
    expect(photoIntent('учти это фото')).toBe('refine')
    expect(photoIntent(PHOTO_REFINE)).toBe('refine')
  })

  it('leaves photos without words, or with words it does not know, unclear (Scenario: Фото без текста)', () => {
    expect(photoIntent('')).toBe('unclear')
    expect(photoIntent(PHOTO_TEXT)).toBe('unclear')
    expect(photoIntent('смотри, что нашёл')).toBe('unclear')
  })

  it('asks the text model about the words the rules do not know', async () => {
    const model = modelSays({ intent: 'similar' })
    expect(await modelPhotoIntent(model, 'а вот так можно?')).toBe('similar')
    expect(model.doGenerateCalls[0].prompt.at(-1)).toMatchObject({ role: 'user' })
    expect(await modelPhotoIntent(modelSays({ intent: 'whatever' }), 'хм')).toBe('unclear')
  })
})

describe('seePhotos', () => {
  it('sends the photos as images and keeps the Russian answer with Latin names', async () => {
    const model = modelSays({
      description: 'Светлый номер с балконом и видом на море, рядом пляж Malvarrosa.',
      view: 'sea',
      features: ['Вид на море', 'балкон', 'pool party', 'вид на море'],
      place: 'Валенсия',
    })
    const sight = await seePhotos(model, [photo, photo])
    expect(sight).toEqual({
      description: 'Светлый номер с балконом и видом на море, рядом пляж Malvarrosa.',
      view: 'sea',
      features: ['вид на море', 'балкон'],
      place: 'Валенсия',
    })
    const [call] = model.doGenerateCalls
    const user = call.prompt.at(-1)!
    expect(user.role).toBe('user')
    const parts = user.content as { type: string; mediaType?: string }[]
    expect(parts.filter((p) => p.type === 'file')).toHaveLength(2)
    expect(parts[0].mediaType).toBe('image/webp')
    expect(call.responseFormat).toMatchObject({ type: 'json' })
  })

  it('drops an unknown view and an unsure place', async () => {
    const sight = await seePhotos(
      modelSays({ description: 'Бассейн у отеля среди пальм.', view: 'moon', features: [], place: null }),
      [photo],
    )
    expect(sight).toEqual({ description: 'Бассейн у отеля среди пальм.', features: [] })
  })

  it('throws on an answer not in Russian: the route says it could not look', async () => {
    await expect(
      seePhotos(modelSays({ description: 'A bright room with a sea view.', features: [] }), [photo]),
    ).rejects.toThrow()
    await expect(seePhotos(modelSays({ description: '海景房', features: [] }), [photo])).rejects.toThrow()
  })
})

describe('the photo in the search', () => {
  const sight = { description: 'Номер с видом на море.', view: 'sea' as const, features: ['бассейн'] }

  it('looks for similar hotels by the description and the features', () => {
    expect(similarQuery(sight)).toBe('Номер с видом на море. вид на море. бассейн')
    expect(sightFeatures(sight)).toBe('вид на море, бассейн')
  })

  it('adds what the photo shows to the traveller’s words, marked «по фото»', () => {
    expect(refinedText('Валенсия в ноябре', sight)).toBe('Валенсия в ноябре. По фото: вид на море, бассейн')
    expect(refinedText(PHOTO_REFINE, sight)).toBe('По фото: вид на море, бассейн')
    expect(refinedText(PHOTO_TEXT, { description: 'Старый город.', features: [] })).toBe('По фото: Старый город.')
  })

  it('takes only the optimised WebP and JPEG data URLs', () => {
    expect(PHOTO_DATA_URL.test(photo)).toBe(true)
    expect(PHOTO_DATA_URL.test('data:image/jpeg;base64,AAAA')).toBe(true)
    expect(PHOTO_DATA_URL.test('data:image/svg+xml;base64,AAAA')).toBe(false)
    expect(PHOTO_DATA_URL.test('https://example.com/a.webp')).toBe(false)
  })
})
