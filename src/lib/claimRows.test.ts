import { describe, expect, it } from 'vitest'
import {
  CHUNK_CHARS,
  MENTION_CHARS,
  NOISE_MENTION,
  canonical,
  chunksOf,
  claimKey,
  mentionExcerpt,
  mergeStores,
  nearbyStore,
  noiseStore,
  reviewStore,
  sameRow,
  type Dataset,
} from './claimRows'

const hotel = { id: 'ota-1', name: 'Hotel', lat: 39.47, lon: -0.376 }
const eea: Dataset = {
  id: 'eea-noise-end2022-v01_r00',
  name: 'EEA noise contours',
  version: 'v01_r00',
  url: 'https://sdi.eea.europa.eu/x',
  extract: 'ES.gpkg',
  processing: 'cut',
  loaded_at: '2026-10-26 18:06:03.471+00',
}
const band = (source: string, indicator: string, db_min: number | null, db_max: number | null) => ({
  source,
  indicator,
  db_min,
  db_max,
  category: `${indicator}x`,
  dataset: eea.id,
})

// hotel-knowledge, Requirement: Заполнение шума отелей
describe('noiseStore', () => {
  it('reports the EEA bands by layer with the dataset as evidence and derives the day estimate', () => {
    const store = noiseStore(
      hotel,
      [
        band('roadsInAgglomeration', 'Lden', 70, 74),
        band('roadsInAgglomeration', 'Lnight', 60, 64),
        band('industryInAgglomeration', 'Lden', null, 39),
        { source: 'broken', indicator: 'Lday', db_min: 1, db_max: 2, dataset: eea.id },
      ],
      [eea],
    )
    expect(store.entities).toEqual([{ kind: 'hotel', ref: 'ota-1', hotel_id: 'ota-1', name: 'Hotel' }])
    expect(store.evidence).toEqual([
      expect.objectContaining({
        type: 'dataset',
        provider: 'EEA',
        external_id: eea.id,
        url: eea.url,
        dataset_id: eea.id,
        retrieved_at: '2026-10-26T18:06:03.471Z',
      }),
    ])
    const night = store.claims.find((c) => c.property === 'noise.lnight.roadsInAgglomeration')!
    expect(night).toMatchObject({
      value_min: 60,
      value_max: 64,
      value_numeric: null,
      unit: 'dB',
      epistemic_status: 'reported',
      confidence: null,
      calculation: null,
      evidence: [{ evidence: `EEA:${eea.id}`, role: 'source' }],
    })
    expect(night.limitations.join(' ')).toMatch(/не измерение у окна.*Полоса 5 дБ/)
    const open = store.claims.find((c) => c.property === 'noise.lden.industryInAgglomeration')!
    expect(open).toMatchObject({ value_min: null, value_max: 39 })
    expect(open.limitations.join(' ')).toMatch(/ниже 40 дБ/)
    // Only the roads have both bands.
    expect(store.calculations).toHaveLength(1)
    expect(store.calculations[0]).toMatchObject({
      key: 'noise.lday:ota-1:roadsInAgglomeration',
      inputs: { lden: { min: 70, max: 74 }, lnight: { min: 60, max: 64 } },
      parameters: { evening_equals_day: true },
    })
    const day = store.claims.find((c) => c.property === 'noise.lday.estimate.roadsInAgglomeration')!
    expect(day).toMatchObject({
      epistemic_status: 'derived',
      calculation: 'noise.lday:ota-1:roadsInAgglomeration',
      evidence: [{ evidence: `EEA:${eea.id}`, role: 'input' }],
    })
    expect(day.value_min).toBeGreaterThan(60)
    expect(day.value_max).toBeLessThan(75)
    expect(store.claims.some((c) => c.property.includes('broken'))).toBe(false)
  })

  it('claims nothing for a point outside the contours or of an unknown dataset', () => {
    expect(noiseStore(hotel, [], [eea]).claims).toEqual([])
    expect(noiseStore(hotel, [band('roadsInAgglomeration', 'Lden', 60, 64)], []).entities).toEqual([])
  })
})

const place = (osm_id: number, category: string, distance_m: number, extra: object = {}) => ({
  osm_type: 'node',
  osm_id,
  category,
  categories: [category],
  name: `P${osm_id}`,
  distance_m,
  fetched_at: '2026-10-26T19:30:00.378+00:00',
  attribution: '© OpenStreetMap contributors, ODbL 1.0',
  origin: 'preload',
  ...extra,
})

// hotel-knowledge, Requirement: Шумные места рядом
describe('nearbyStore', () => {
  const options = { radiusM: 200, perCategory: 2 }

  it('links the loud places with their distance, OSM evidence and the count of each category', () => {
    const store = nearbyStore(
      hotel,
      {
        places: [
          place(2, 'bar', 80, { categories: ['bar', 'restaurant'] }),
          place(1, 'bar', 20),
          place(2, 'restaurant', 80, { categories: ['bar', 'restaurant'] }),
          place(3, 'pharmacy', 5),
          place(4, 'nightclub', 150, { fetched_at: null, name: null }),
        ],
        covered: ['bar', 'restaurant', 'nightclub', 'tram'],
      },
      options,
    )
    expect(store.entities.map((e) => e.ref)).toEqual(['ota-1', 'node/1', 'node/2', 'node/4'])
    expect(store.evidence.find((e) => e.external_id === 'node/4')).toMatchObject({
      type: 'osm',
      provider: 'OpenStreetMap',
      title: 'node/4',
      url: 'https://www.openstreetmap.org/node/4',
      retrieved_at: null,
    })
    const distance = store.claims.find((c) => c.property === 'noise.nearby.distance' && c.source_key === 'node/2')!
    expect(distance).toMatchObject({
      value_numeric: 80,
      unit: 'm',
      epistemic_status: 'derived',
      calculation: 'noise.nearby:ota-1',
      method: { categories: ['bar', 'restaurant'] },
    })
    expect(store.relations).toContainEqual({
      subject: 'hotel:ota-1',
      predicate: 'near',
      object: 'osm_place:node/2',
      claim: claimKey(distance),
      evidence: 'OpenStreetMap:node/2',
    })
    const count = (category: string) => store.claims.find((c) => c.property === `noise.nearby.${category}.count`)
    // Two bars reach the answer's limit: «2 and more».
    expect(count('bar')).toMatchObject({ value_numeric: null, value_min: 2, value_max: null })
    expect(count('restaurant')).toMatchObject({ value_numeric: 1 })
    expect(count('nightclub')).toMatchObject({ value_numeric: 1 })
    // No tram found is no claim: OSM may lack it.
    expect(count('tram')).toBeUndefined()
    expect(store.claims.every((c) => c.confidence === null)).toBe(true)
  })

  it('makes nothing of an answer without places', () => {
    expect(nearbyStore(hotel, null, options).entities).toEqual([])
    expect(nearbyStore(hotel, { places: [], covered: ['bar'] }, options).claims).toEqual([])
  })
})

const review = (id: number, parts: Record<string, string>, extra: object = {}) => ({
  id,
  rating: 8,
  reviewDate: '2019-06-26 14:41:44.353331+00',
  reviewType: 'OST',
  isTranslatedByAI: false,
  reviewTitle: '',
  reviewText: '',
  reviewPlus: '',
  reviewMinus: '',
  orderContext: { authorName: 'Ildar', authorRoom: 'Кровать' },
  ...parts,
  ...extra,
})

// hotel-knowledge, Requirement: Отзывы как документы, Упоминания шума в отзывах
describe('reviewStore', () => {
  const page = (list: unknown[]) => ({ master_id: 1, updated_at: '2026-10-26 19:43:48.681+00', list })

  it('keeps each review as a document of its parts with its evidence and quotes its words about noise', () => {
    const store = reviewStore(
      hotel,
      page([
        review(10, {
          reviewTitle: 'Дешево, шумно, весело',
          reviewPlus: 'Расположение.\r\nЗавтрак отличный!',
          reviewMinus: 'По ночам слышно улицу. Матрасы мягкие.',
        }),
        review(11, { reviewPlus: 'Всё понравилось' }),
        review(12, {}),
      ]),
    )
    expect(store.evidence.map((e) => e.external_id)).toEqual(['10', '11'])
    expect(store.evidence[0]).toMatchObject({
      type: 'review',
      provider: 'Островок',
      url: null,
      retrieved_at: '2026-10-26T19:43:48.681Z',
      title: 'Отзыв гостя от 2019-06-26',
      metadata: { master_id: 1, rating: 8, review_type: 'OST', review_date: '2019-06-26T14:41:44.353Z' },
    })
    const [document] = store.documents
    expect(document).toMatchObject({ kind: 'review', hotel_id: 'ota-1', entity: 'hotel:ota-1', language: 'ru' })
    expect(document.text).toBe(
      'Дешево, шумно, весело\n\nРасположение.\nЗавтрак отличный!\n\nПо ночам слышно улицу. Матрасы мягкие.',
    )
    expect(document.chunks.map((c) => [c.ord, c.metadata.part])).toEqual([
      [0, 'title'],
      [1, 'plus'],
      [2, 'minus'],
    ])
    // The author is not copied.
    expect(JSON.stringify(store)).not.toMatch(/Ildar|Кровать/)
    expect(store.claims.map((c) => [c.source_key, c.value_text])).toEqual([
      ['10:title:0', 'Дешево, шумно, весело'],
      ['10:minus:0', 'По ночам слышно улицу.'],
    ])
    expect(store.claims[0]).toMatchObject({
      property: 'noise.review.mention',
      epistemic_status: 'reported',
      confidence: null,
      observed_at: '2019-06-26T14:41:44.353Z',
      evidence: [{ evidence: 'Островок:10', role: 'source' }],
    })
  })

  it('claims nothing of a review that does not speak of noise', () => {
    const store = reviewStore(hotel, page([review(11, { reviewPlus: 'Стихи читали на террасе. Тихоня-кот.' })]))
    expect(store.documents).toHaveLength(1)
    // «Тихоня» is about quiet as well; «Стихи» is not.
    expect(store.claims.map((c) => c.value_text)).toEqual(['Тихоня-кот.'])
    expect(reviewStore(hotel, page([review(11, { reviewPlus: 'Всё понравилось' })])).claims).toEqual([])
  })
})

describe('the words about noise', () => {
  it.each(['шумно', 'Тишина', 'тихий двор', 'громко', 'звукоизоляция', 'слышно соседей', 'бесшумный', 'noisy'])(
    'finds «%s»',
    (text) => expect(NOISE_MENTION.test(text)).toBe(true),
  )
  it.each(['стихи', 'вестибюль', 'cloud'])('does not find «%s»', (text) => expect(NOISE_MENTION.test(text)).toBe(false))

  it('cuts a long sentence around its word', () => {
    const long = `${'а'.repeat(400)} шумно ${'б'.repeat(400)}`
    const excerpt = mentionExcerpt(long)
    expect(excerpt).toMatch(/^….*шумно.*…$/)
    expect(excerpt.length).toBeLessThanOrEqual(MENTION_CHARS + 2)
  })
})

describe('chunksOf', () => {
  it('cuts a long part between its sentences', () => {
    const sentence = `${'с'.repeat(900)}.`
    const chunks = chunksOf(`${sentence} ${sentence} ${sentence}`)
    expect(chunks).toHaveLength(2)
    expect(chunks.every((c) => c.length <= CHUNK_CHARS)).toBe(true)
    expect(chunksOf('x'.repeat(CHUNK_CHARS + 1))).toHaveLength(2)
  })
})

describe('mergeStores', () => {
  it('keeps each entity and evidence once', () => {
    const a = noiseStore(hotel, [band('roadsInAgglomeration', 'Lden', 60, 64)], [eea])
    const merged = mergeStores([a, a])
    expect(merged.entities).toHaveLength(1)
    expect(merged.evidence).toHaveLength(1)
    expect(merged.claims).toHaveLength(1)
  })
})

// hotel-knowledge, Requirement: Повторное заполнение
describe('sameRow', () => {
  it('compares the times as instants and JSON whatever its order', () => {
    expect(
      sameRow(
        { retrieved_at: '2026-10-26T18:06:03.471+00:00', metadata: { b: 1, a: [1, 2] }, value_min: 60, extra: 1 },
        { retrieved_at: '2026-10-26T18:06:03.471Z', metadata: { a: [1, 2], b: 1 }, value_min: 60 },
      ),
    ).toBe(true)
    expect(sameRow({ metadata: { a: 1 } }, { metadata: { a: 2 } })).toBe(false)
    expect(sameRow({ value_min: null }, { value_min: 60 })).toBe(false)
    expect(sameRow({ limitations: ['a', 'b'] }, { limitations: ['b', 'a'] })).toBe(false)
    expect(canonical({ b: { d: 1, c: 2 }, a: 1 })).toBe('{"a":1,"b":{"c":2,"d":1}}')
  })
})
