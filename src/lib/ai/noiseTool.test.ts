import { describe, expect, it, vi } from 'vitest'
import type { ClaimEvidence, HotelChunk, HotelClaim } from '../db/claims'
import { toolResultSchema } from '../toolResult'
import { noiseToolResult, reviewExcerpt, runNoiseTool } from './noiseTool'

vi.mock('next/cache', () => ({ unstable_cache: (read: unknown) => read }))

/** The store's rows of ota-9741622 as `loadHotelClaims` reads them (supabase, 2026-10-27), cut to a few. */
const eea: ClaimEvidence = {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'input',
  type: 'dataset',
  title: 'EEA noise contours, Environmental Noise Directive, round 2022 v01_r00',
  provider: 'EEA',
  externalId: 'eea-noise-end2022-v01_r00',
  url: 'https://sdi.eea.europa.eu/datastore/public?path=/eea_v_3035_1_k_noise-contours-end2022_p_2026_v01_r00',
  retrievedAt: '2026-10-26T18:06:03.471+00:00',
  excerpt: null,
  datasetId: 'eea-noise-end2022-v01_r00',
}
const eubucco: ClaimEvidence = {
  ...eea,
  id: '77777777-7777-4777-8777-777777777777',
  title: 'EUBUCCO v0.2',
  provider: 'EUBUCCO',
  externalId: 'eubucco-v0.2',
  url: 'https://eubucco.com/data/download/v0.2',
  datasetId: 'eubucco-v0.2',
}
const osm: ClaimEvidence = {
  ...eea,
  id: '22222222-2222-4222-8222-222222222222',
  role: 'input',
  type: 'osm',
  title: 'Pasión turca',
  provider: 'OpenStreetMap',
  externalId: 'node/1632037131',
  url: 'https://www.openstreetmap.org/node/1632037131',
  datasetId: null,
}
const bar: ClaimEvidence = {
  ...osm,
  id: '88888888-8888-4888-8888-888888888888',
  title: 'cerveceria tames',
  externalId: 'node/4590181790',
  url: 'https://www.openstreetmap.org/node/4590181790',
}
const claim = (fields: Partial<HotelClaim> & Pick<HotelClaim, 'id' | 'property' | 'value'>): HotelClaim => ({
  sourceKey: '',
  unit: 'dB',
  status: 'derived',
  confidence: null,
  method: {},
  observedAt: null,
  validFrom: null,
  validTo: null,
  limitations: [],
  calculation: estimateCalculation,
  evidence: [eea, eubucco],
  ...fields,
})
const estimateCalculation = {
  id: '33333333-3333-4333-8333-333333333333',
  method:
    'Оценка шума у фасада: самые громкие (улица) и самые тихие (двор) полосы карт шума EEA у контура здания, энергетическая сумма слоёв и шумных мест OpenStreetMap как точечных источников',
  version: 'noise-estimate-v1',
  inputs: {
    zone: { kind: 'building', building_id: '21adf97303954791-16', buffer_m: 5 },
    street_bands: { roadsInAgglomeration: { lden: { min: 70, max: 74 }, lnight: { min: 65, max: 69 } } },
    places: [{ category: 'bar', name: 'cerveceria tames', distance_m: 85.5, levels_db: { night: 43.4 } }],
  },
  parameters: { facade_buffer_m: 5, attenuation: 'L = Lref − 20·lg(d/10)' },
  limitations: ['Экранирование зданиями не учитывается: шум заведения доходит до фасада и двора без препятствий'],
  computedAt: '2026-10-27T20:40:00Z',
}
const osmCalculation = {
  id: '44444444-4444-4444-8444-444444444444',
  method: 'osm_places_near: расстояние по прямой от точки отеля до формы объекта OSM',
  version: 'osm_places_near-1',
  inputs: { lat: 39.466843, lon: -0.355094 },
  parameters: { radius_m: 200, categories: ['bar', 'restaurant'] },
  limitations: ['Расстояние по прямой до формы объекта, не путь пешком'],
  computedAt: '2026-10-26T19:30:00Z',
}
const claims: HotelClaim[] = [
  // EEA's band at the point is in the store but not the tool's: the facade is read instead.
  claim({
    id: 'point-industry',
    property: 'noise.lden.industryInAgglomeration',
    value: { kind: 'range', min: null, max: 39 },
    status: 'reported',
    calculation: null,
    evidence: [eea],
  }),
  claim({ id: 'facade-night', property: 'noise.estimate.facade.lnight', value: { kind: 'range', min: 65, max: 70 } }),
  claim({ id: 'yard-night', property: 'noise.estimate.yard.lnight', value: { kind: 'range', min: 43.4, max: 47.1 } }),
  claim({ id: 'street-night', property: 'noise.estimate.street.lnight', value: { kind: 'range', min: 65, max: 70 } }),
  claim({ id: 'street-day', property: 'noise.estimate.street.lday', value: { kind: 'range', min: 65.2, max: 73.2 } }),
  claim({
    id: 'venues-night',
    property: 'noise.estimate.venues.lnight',
    value: { kind: 'number', value: 43.4 },
    evidence: [bar],
  }),
  claim({
    id: 'count-restaurant',
    property: 'noise.nearby.restaurant.count',
    value: { kind: 'range', min: 20, max: null },
    unit: 'count',
    limitations: ['Ответ ограничен: мест может быть больше'],
    calculation: osmCalculation,
    evidence: [osm],
  }),
  claim({
    id: 'far',
    property: 'noise.nearby.distance',
    sourceKey: 'node/9270705402',
    value: { kind: 'number', value: 110.2 },
    unit: 'm',
    method: { categories: ['restaurant'] },
    calculation: osmCalculation,
    evidence: [
      { ...osm, id: '55555555-5555-4555-8555-555555555555', title: 'Tian an men', externalId: 'node/9270705402' },
    ],
  }),
  claim({
    id: 'near',
    property: 'noise.nearby.distance',
    sourceKey: 'node/1632037131',
    value: { kind: 'number', value: 52.7 },
    unit: 'm',
    method: { categories: ['restaurant'] },
    calculation: osmCalculation,
    evidence: [osm],
  }),
  // The reviews' mentions are not the tool's claims: the reviews come as quotes.
  claim({ id: 'mention', property: 'noise.review.mention', value: { kind: 'text', value: 'шумно' } }),
]
const review: ClaimEvidence = {
  ...eea,
  id: '66666666-6666-4666-8666-666666666666',
  role: null,
  type: 'review',
  title: 'Отзыв гостя от 2018-09-24',
  provider: 'Островок',
  externalId: '253866',
  url: null,
  retrievedAt: '2026-10-26T19:43:48.681+00:00',
  datasetId: null,
}
const chunk = (text: string, evidenceId = review.id): HotelChunk => ({
  chunkId: crypto.randomUUID(),
  documentId: crypto.randomUUID(),
  evidenceId,
  kind: 'review',
  ord: 0,
  text,
  metadata: { part: 'minus' },
  rank: 0.1,
})

// assistant-search, Requirement: Инструмент «Анализ шума»
describe('the noise tool', () => {
  const result = noiseToolResult(
    'ota-9096882',
    claims,
    [chunk('Отличный завтрак. Тонкие стены из-за чего очень шумно.')],
    [review],
  )

  it('gives a result of the contract from the store’s claims', () => {
    expect(toolResultSchema.safeParse(result).success).toBe(true)
    expect(result.status).toBe('success')
    expect(result.summary).toBe(
      'У фасада на улицу: днём 65–73 дБ, ночью 65–70 дБ; окна во двор: ночью 43–47 дБ; шумных мест OpenStreetMap в 200 м: 20 и больше; отзывов о шуме и тишине: 1',
    )
  })

  it('shows the estimate at the facade, the street first, with its calculation, then the nearest place of a kind', () => {
    expect(result.claims.map((c) => [c.label, c.value, c.status])).toEqual([
      ['Фасад на улицу, днём (07:00–19:00)', '65–73 дБ', 'derived'],
      ['Фасад на улицу, ночью (23:00–07:00)', '65–70 дБ', 'derived'],
      ['Окна во двор, ночью', '43–47 дБ', 'derived'],
      ['Вклад заведений рядом, ночью', '≈43 дБ', 'derived'],
      ['Карты шума EEA у фасада на улицу, ночью (Lnight)', '65–70 дБ', 'derived'],
      ['Рестораны в 200 м', '20 и больше', 'derived'],
      ['Ближайшее место: ресторан «Pasión turca»', '50 м', 'derived'],
    ])
    const estimate = result.calculations.find((c) => c.id === estimateCalculation.id)!
    expect(estimate).toEqual({
      id: estimateCalculation.id,
      name: estimateCalculation.method,
      version: '1',
      inputs: [
        { label: 'Зона фасада', value: 'контур здания EUBUCCO 21adf97303954791-16 и 5 м вокруг' },
        { label: 'Полосы EEA у фасада на улицу', value: 'Дороги города: 70–74 дБ за сутки, 65–69 дБ ночью' },
        { label: 'Заведения в расчёте', value: 'бар «cerveceria tames» — 90 м' },
        { label: 'Буфер вокруг контура здания, м', value: '5' },
        { label: 'Затухание', value: 'L = Lref − 20·lg(d/10)' },
      ],
      assumptions: estimateCalculation.limitations,
    })
    expect(result.claims.find((c) => c.id === 'street-day')!.calculation_id).toBe(estimateCalculation.id)
    // No name of a function in what is shown.
    expect(result.calculations.find((c) => c.id === osmCalculation.id)!.name).toBe(
      'Расстояние по прямой от точки отеля до формы объекта OSM',
    )
  })

  it('cites only the store’s sources, each once, with the review’s words as the excerpt', () => {
    expect(result.evidence.map((e) => [e.source_type, e.source_name, e.source_id])).toEqual([
      ['dataset', 'EEA', 'eea-noise-end2022-v01_r00'],
      ['dataset', 'EUBUCCO', 'eubucco-v0.2'],
      ['osm', 'OpenStreetMap', 'node/4590181790'],
      ['osm', 'OpenStreetMap', 'node/1632037131'],
      ['review', 'Островок', '253866'],
    ])
    expect(result.evidence.at(-1)).toMatchObject({
      excerpt: 'Тонкие стены из-за чего очень шумно.',
      source_url: null,
      retrieved_at: '2026-10-26T19:43:48.681+00:00',
    })
    // The confidence of the store is null here: none is made up.
    expect(result.claims.every((c) => c.confidence === null)).toBe(true)
    expect(result.limitations).toContain(
      'Экранирование зданиями не учитывается: шум заведения доходит до фасада и двора без препятствий',
    )
  })

  it('says «нет данных EEA», not «тихо», for a hotel outside the contours', () => {
    const outside = noiseToolResult('ota-1', [], [], [])
    expect(outside.status).toBe('success')
    expect(outside.summary).toBe('Нет данных EEA; отзывов о шуме и тишине: 0')
    expect(outside.evidence).toEqual([])
    expect(outside.limitations[0]).toMatch(/^Нет данных EEA: здание отеля вне загруженных карт шума/)
    expect(outside.summary).not.toMatch(/тихо/)
  })

  it('never lowers a level for windows or walls', () => {
    expect(result.limitations).toContain('Звукоизоляция окон и номеров не оценивается: уровни — снаружи здания')
    expect(JSON.stringify(result)).not.toMatch(/снижа|минус \d+ дБ/)
  })

  it('is an error when the store cannot be read, and goes on without the reviews (Scenario: Ошибка инструмента)', () => {
    const failed = noiseToolResult('ota-9096882', null, null, null)
    expect(failed).toMatchObject({ status: 'error', evidence: [], error: { code: 'store_unavailable' } })
    expect(toolResultSchema.safeParse(failed).success).toBe(true)
    const noReviews = noiseToolResult('ota-9096882', claims, null, null)
    expect(noReviews.status).toBe('success')
    expect(noReviews.limitations).toContain('Отзывы прочитать не удалось')
    expect(noReviews.evidence.some((e) => e.source_type === 'review')).toBe(false)
  })

  it('drops a link that is not http(s)', () => {
    const odd = claim({
      id: 'odd',
      property: 'noise.estimate.street.lnight',
      value: { kind: 'range', min: 50, max: 54 },
      evidence: [{ ...eea, url: 'javascript:alert(1)' }],
    })
    expect(noiseToolResult('ota-1', [odd], [], []).evidence[0].source_url).toBeNull()
  })

  it('has no data of a synthetic hotel, says so and cites nothing', async () => {
    const synthetic = await runNoiseTool('prague-old-town-lantern')
    expect(synthetic).toMatchObject({ status: 'success', evidence: [], claims: [] })
    expect(synthetic.limitations[0]).toMatch(/^Отель не из базы Островка/)
  })

  it('quotes the sentence of a review about the noise', () => {
    expect(reviewExcerpt('Всё понравилось. Ночью было тихо, спали отлично. Завтрак вкусный.')).toBe(
      'Ночью было тихо, спали отлично.',
    )
    expect(reviewExcerpt('Хороший отель')).toBe('Хороший отель')
  })
})
