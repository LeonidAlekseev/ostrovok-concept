import { describe, expect, it } from 'vitest'
import {
  CHUNK_CHARS,
  MENTION_CHARS,
  NEARBY_CATEGORIES,
  NOISE_MENTION,
  canonical,
  chunksOf,
  claimKey,
  mentionExcerpt,
  mergeStores,
  nearbyStore,
  noiseStore,
  placesStore,
  reviewStore,
  sameRow,
  buildingStore,
  type Dataset,
  type OstrovokPlace,
  type Store,
} from './claimRows'
import { CONFIDENCE, CONFIDENCE_POLICY, type ConfidenceKind } from './confidence'

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
      confidence: 0.9,
      method: { confidence: { policy: 'confidence-1', rule: 'eea_band' } },
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
      confidence: 0.8,
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
      confidence: 1,
      method: { categories: ['bar', 'restaurant'], confidence: { policy: 'confidence-1', rule: 'osm_distance' } },
    })
    expect(store.relations).toContainEqual({
      subject: 'hotel:ota-1',
      predicate: 'near',
      object: 'osm_place:node/2',
      claim: claimKey(distance),
      evidence: 'OpenStreetMap:node/2',
      confidence: 1,
    })
    const count = (category: string) => store.claims.find((c) => c.property === `noise.nearby.${category}.count`)
    // Two bars reach the answer's limit: «2 and more».
    expect(count('bar')).toMatchObject({ value_numeric: null, value_min: 2, value_max: null })
    expect(count('restaurant')).toMatchObject({ value_numeric: 1 })
    expect(count('nightclub')).toMatchObject({ value_numeric: 1 })
    // No tram found is no claim: OSM may lack it.
    expect(count('tram')).toBeUndefined()
    // A count assumes OSM has every place: 0.9.
    expect(count('bar')!.confidence).toBe(0.9)
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
      confidence: 0.75,
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

const eubucco: Dataset = { ...eea, id: 'eubucco-v0.2', name: 'EUBUCCO', version: 'v0.2', url: 'https://eubucco.com' }

// hotel-knowledge, Requirement: Места повседневных нужд рядом
describe('placesStore', () => {
  const options = { radiusM: 1000, perCategory: 5 }
  const at = (osm_id: number, category: string, distance_m: number, extra: object = {}) =>
    place(osm_id, category, distance_m, { lat: 39.47 + osm_id / 1e5, lon: -0.376, tags: {}, ...extra })
  const station: OstrovokPlace = {
    master_id: 1,
    region_id: 77,
    type: 'SUBWAY',
    subtype: 'UNSPECIFIED',
    name: 'Колон',
    name_en: 'Colon',
    distance_m: 300,
    lat: 39.4705,
    lon: -0.376,
    updated_at: '2026-10-26 10:00:00+00',
  }

  it('links the places of everyday need within 1 km with their OSM distance', () => {
    const store = placesStore(
      hotel,
      {
        places: [at(1, 'pharmacy', 120), at(2, 'supermarket', 640), at(3, 'bar', 10), at(4, 'park', 900)],
        covered: ['pharmacy', 'supermarket', 'park'],
      },
      [],
      options,
    )
    expect(store.entities.map((e) => e.ref)).toEqual(['ota-1', 'node/1', 'node/2', 'node/4'])
    const pharmacy = store.claims.find((c) => c.source_key === 'node/1')!
    expect(pharmacy).toMatchObject({
      property: 'nearby.distance',
      value_numeric: 120,
      epistemic_status: 'derived',
      confidence: 1,
      calculation: 'nearby.places:ota-1',
      method: { categories: ['pharmacy'], confidence: { policy: CONFIDENCE_POLICY, rule: 'osm_distance' } },
      evidence: [{ evidence: 'OpenStreetMap:node/1', role: 'input' }],
    })
    expect(store.relations).toContainEqual({
      subject: 'hotel:ota-1',
      predicate: 'near',
      object: 'osm_place:node/1',
      claim: claimKey(pharmacy),
      evidence: 'OpenStreetMap:node/1',
      confidence: 1,
    })
    expect(store.calculations[0].inputs.covered).toEqual(['pharmacy', 'supermarket', 'park'])
    expect(store.calculations[0].limitations.join(' ')).toMatch(/Кэш OSM ограничен тем, что загружено/)
    // No hospital found is no claim of «нет больницы».
    expect(JSON.stringify(store.claims)).not.toMatch(/hospital/)
  })

  it('takes the Ostrovok place for the OSM one within 30 m', () => {
    const store = placesStore(
      hotel,
      { places: [at(5, 'metro', 290, { lat: 39.4705, lon: -0.37601, name: 'Colón' })], covered: [] },
      [station, { ...station, region_id: 78, type: 'POI', subtype: 'MUSEUM', name: 'Музей' }],
      options,
    )
    expect(store.relations.map((r) => r.object)).toEqual(['ota_poi:77'])
    expect(store.calculations).toEqual([])
    expect(store.claims).toEqual([
      expect.objectContaining({
        property: 'nearby.distance',
        source_key: 'ota_poi/77',
        value_numeric: 300,
        epistemic_status: 'reported',
        confidence: 1,
        method: {
          kind: 'Станция',
          osm: ['node/5'],
          categories: ['metro'],
          confidence: { policy: CONFIDENCE_POLICY, rule: 'ostrovok_place_distance' },
        },
        evidence: [{ evidence: 'Островок:poi:1:77', role: 'source' }],
      }),
    ])
    expect(store.evidence[0]).toMatchObject({ type: 'ota_page', url: null, retrieved_at: '2026-10-26T10:00:00.000Z' })
  })

  it('makes nothing without places', () => {
    expect(placesStore(hotel, { places: [], covered: [...NEARBY_CATEGORIES] }, [], options)).toEqual(mergeStores([]))
  })
})

// hotel-knowledge, Requirement: Ближайшее здание
describe('buildingStore', () => {
  const building = {
    id: 'b-1',
    height: 21.200000762939453,
    floors: 6,
    distance_m: 0,
    dataset: eubucco.id,
    height_source: 'estimated',
    height_confidence_lower: 18.5,
    height_confidence_upper: 24,
    floors_source: 'gov-spain',
  }

  it('links the nearest building and reports its height and floors from EUBUCCO', () => {
    const store = buildingStore(hotel, building, [eubucco])
    expect(store.relations).toEqual([
      expect.objectContaining({ predicate: 'nearest_building', object: 'building:b-1', confidence: 0.9 }),
    ])
    const height = store.claims.find((c) => c.property === 'building.height')!
    expect(height).toMatchObject({
      entity: 'hotel:ota-1',
      source_key: 'b-1',
      value_numeric: 21.2,
      unit: 'm',
      epistemic_status: 'reported',
      confidence: 0.9,
      method: { source: 'estimated', lower: 18.5, upper: 24 },
      evidence: [{ evidence: 'EUBUCCO:eubucco-v0.2', role: 'source' }],
    })
    expect(height.limitations.join(' ')).toMatch(/не обязательно здание отеля.*оценена моделью/)
    expect(store.claims.find((c) => c.property === 'building.floors')!.limitations.join(' ')).not.toMatch(/моделью/)
    expect(store.claims.find((c) => c.property === 'building.nearest.distance')).toMatchObject({
      epistemic_status: 'derived',
      confidence: 0.9,
      calculation: 'building.nearest:ota-1',
    })
  })

  it('makes nothing without a building or its dataset', () => {
    expect(buildingStore(hotel, null, [eubucco]).claims).toEqual([])
    expect(buildingStore(hotel, building, [eea]).claims).toEqual([])
  })
})

// hotel-knowledge, Requirement: Политика уверенности
describe('the confidence of the claims', () => {
  it('follows the policy: the least input less each assumption', () => {
    expect(CONFIDENCE).toMatchObject({
      ostrovok_fact: 1,
      ostrovok_place_distance: 1,
      room_name_view: 1,
      osm_place: 1,
      eea_band: 0.9,
      eubucco_building: 0.9,
      review_mention: 0.75,
      owner_answer: 0.75,
      osm_distance: 1,
      osm_count: 0.9,
      building_distance: 0.9,
      day_estimate: 0.8,
      inferred: 0.5,
    })
  })

  it('gives every claim the script writes the confidence of its rule', () => {
    const stores: Store[] = [
      noiseStore(
        hotel,
        [band('roadsInAgglomeration', 'Lden', 70, 74), band('roadsInAgglomeration', 'Lnight', 60, 64)],
        [eea],
      ),
      nearbyStore(hotel, { places: [place(1, 'bar', 20), place(2, 'tram', 90)] }, { radiusM: 200, perCategory: 20 }),
      placesStore(hotel, { places: [place(3, 'pharmacy', 300, { lat: 39.47, lon: -0.37, tags: {} })] }, [], {
        radiusM: 1000,
        perCategory: 5,
      }),
      buildingStore(hotel, { id: 'b', height: 9, floors: 3, distance_m: 4, dataset: eubucco.id }, [eubucco]),
      reviewStore(hotel, {
        master_id: 1,
        updated_at: '2026-10-26 10:00:00+00',
        list: [{ id: 1, reviewMinus: 'Шумно ночью.' }],
      }),
    ]
    const claims = mergeStores(stores).claims
    expect(new Set(claims.map((c) => (c.method.confidence as { rule: string }).rule))).toEqual(
      new Set([
        'eea_band',
        'day_estimate',
        'osm_distance',
        'osm_count',
        'building_distance',
        'eubucco_building',
        'review_mention',
      ]),
    )
    for (const claim of claims) {
      const { policy, rule } = claim.method.confidence as { policy: string; rule: ConfidenceKind }
      expect(policy).toBe(CONFIDENCE_POLICY)
      expect(claim.confidence).toBe(CONFIDENCE[rule])
    }
    for (const relation of mergeStores(stores).relations)
      expect(relation.confidence).toBe(claims.find((c) => claimKey(c) === relation.claim)!.confidence)
  })
})
