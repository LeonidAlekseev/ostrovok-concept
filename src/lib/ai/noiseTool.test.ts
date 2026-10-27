import { describe, expect, it, vi } from 'vitest'
import type { ClaimEvidence, HotelChunk, HotelClaim } from '../db/claims'
import { toolResultSchema } from '../toolResult'
import { noiseToolResult, reviewExcerpt, runNoiseTool } from './noiseTool'

vi.mock('next/cache', () => ({ unstable_cache: (read: unknown) => read }))

/** The store's rows of ota-9096882 as `loadHotelClaims` reads them (supabase, 2026-10-27), cut to one layer. */
const eea: ClaimEvidence = {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'source',
  type: 'dataset',
  title: 'EEA noise contours, Environmental Noise Directive, round 2022 v01_r00',
  provider: 'EEA',
  externalId: 'eea-noise-end2022-v01_r00',
  url: 'https://sdi.eea.europa.eu/datastore/public?path=/eea_v_3035_1_k_noise-contours-end2022_p_2026_v01_r00',
  retrievedAt: '2026-10-26T18:06:03.471+00:00',
  excerpt: null,
  datasetId: 'eea-noise-end2022-v01_r00',
}
const osm: ClaimEvidence = {
  ...eea,
  id: '22222222-2222-4222-8222-222222222222',
  role: 'input',
  type: 'osm',
  title: 'Pinares 14',
  provider: 'OpenStreetMap',
  externalId: 'node/1632037131',
  url: 'https://www.openstreetmap.org/node/1632037131',
  datasetId: null,
}
const claim = (fields: Partial<HotelClaim> & Pick<HotelClaim, 'id' | 'property' | 'value'>): HotelClaim => ({
  sourceKey: '',
  unit: 'dB',
  status: 'reported',
  confidence: null,
  method: {},
  observedAt: null,
  validFrom: null,
  validTo: null,
  limitations: ['Полоса 5 дБ, а не уровень'],
  calculation: null,
  evidence: [eea],
  ...fields,
})
const dayCalculation = {
  id: '33333333-3333-4333-8333-333333333333',
  method: 'Директива ЕС 2002/49/EC, приложение I: Lday из Lden и Lnight',
  version: 'dayEstimate-1',
  inputs: { lden: { max: 64, min: 60 }, layer: 'roadsInAgglomeration', lnight: { max: 59, min: 55 } },
  parameters: { evening_equals_day: true },
  limitations: ['Допущение: вечер так же громок, как день'],
  computedAt: '2026-10-26T18:10:00Z',
}
const osmCalculation = {
  id: '44444444-4444-4444-8444-444444444444',
  method: 'osm_places_near: расстояние по прямой от точки отеля до формы объекта OSM',
  version: 'osm_places_near-1',
  inputs: { lat: 39.3833, lon: -0.33254 },
  parameters: { radius_m: 200, categories: ['bar', 'restaurant'] },
  limitations: ['Расстояние по прямой до формы объекта, не путь пешком'],
  computedAt: '2026-10-26T19:30:00Z',
}
const claims: HotelClaim[] = [
  claim({
    id: 'lden-rail',
    property: 'noise.lden.railwaysInAgglomeration',
    value: { kind: 'range', min: null, max: 39 },
  }),
  claim({ id: 'lden-road', property: 'noise.lden.roadsInAgglomeration', value: { kind: 'range', min: 60, max: 64 } }),
  claim({
    id: 'lnight-road',
    property: 'noise.lnight.roadsInAgglomeration',
    value: { kind: 'range', min: 55, max: 59 },
  }),
  claim({
    id: 'lday-road',
    property: 'noise.lday.estimate.roadsInAgglomeration',
    value: { kind: 'range', min: 55, max: 63.1 },
    status: 'derived',
    calculation: dayCalculation,
  }),
  claim({
    id: 'count-restaurant',
    property: 'noise.nearby.restaurant.count',
    value: { kind: 'range', min: 20, max: null },
    status: 'derived',
    unit: 'count',
    limitations: ['Ответ ограничен: мест может быть больше'],
    calculation: osmCalculation,
    evidence: [osm],
  }),
  claim({
    id: 'far',
    property: 'noise.nearby.distance',
    sourceKey: 'node/9270705402',
    value: { kind: 'number', value: 107.9 },
    status: 'derived',
    method: { categories: ['restaurant'] },
    calculation: osmCalculation,
    evidence: [
      { ...osm, id: '55555555-5555-4555-8555-555555555555', title: 'Casa Pote', externalId: 'node/9270705402' },
    ],
  }),
  claim({
    id: 'near',
    property: 'noise.nearby.distance',
    sourceKey: 'node/1632037131',
    value: { kind: 'number', value: 41.5 },
    status: 'derived',
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
      'Ночью 55–59 дБ (дороги города), днём оценка 55–63 дБ; шумных мест OpenStreetMap в 200 м: 20 и больше; отзывов о шуме и тишине: 1',
    )
  })

  it('shows the loudest layer first, the day estimate with its calculation, the nearest place of a kind', () => {
    expect(result.claims.map((c) => [c.label, c.value, c.status])).toEqual([
      ['Днём (07:00–19:00), оценка: дороги города', '55–63 дБ', 'derived'],
      ['Ночью (Lnight): дороги города', '55–59 дБ', 'reported'],
      ['За сутки (Lden): дороги города', '60–64 дБ', 'reported'],
      ['За сутки (Lden): железная дорога в городе', 'ниже 40 дБ', 'reported'],
      ['Рестораны в 200 м', '20 и больше', 'derived'],
      ['Ближайшее место: ресторан «Pinares 14»', '40 м', 'derived'],
    ])
    const day = result.calculations.find((c) => c.id === dayCalculation.id)!
    expect(day).toEqual({
      id: dayCalculation.id,
      name: 'Директива ЕС 2002/49/EC, приложение I: Lday из Lden и Lnight',
      version: '1',
      inputs: [
        { label: 'Lden (сутки)', value: '60–64 дБ' },
        { label: 'Источник шума', value: 'Дороги города' },
        { label: 'Lnight (ночь)', value: '55–59 дБ' },
        { label: 'Вечер так же громок, как день', value: 'да' },
      ],
      assumptions: ['Допущение: вечер так же громок, как день'],
    })
    // No name of a function in what is shown.
    expect(result.calculations.find((c) => c.id === osmCalculation.id)!.name).toBe(
      'Расстояние по прямой от точки отеля до формы объекта OSM',
    )
  })

  it('cites only the store’s sources, each once, with the review’s words as the excerpt', () => {
    expect(result.evidence.map((e) => [e.source_type, e.source_name, e.source_id])).toEqual([
      ['dataset', 'EEA', 'eea-noise-end2022-v01_r00'],
      ['osm', 'OpenStreetMap', 'node/1632037131'],
      ['review', 'Островок', '253866'],
    ])
    expect(result.evidence[2]).toMatchObject({
      excerpt: 'Тонкие стены из-за чего очень шумно.',
      source_url: null,
      retrieved_at: '2026-10-26T19:43:48.681+00:00',
    })
    // The confidence of the store is null: none is made up.
    expect(result.claims.every((c) => c.confidence === null)).toBe(true)
  })

  it('says «нет данных EEA», not «тихо», for a hotel outside the contours', () => {
    const outside = noiseToolResult('ota-1', [], [], [])
    expect(outside.status).toBe('success')
    expect(outside.summary).toBe('Нет данных EEA; отзывов о шуме и тишине: 0')
    expect(outside.evidence).toEqual([])
    expect(outside.limitations[0]).toMatch(/^Нет данных EEA: точка отеля вне загруженных карт шума/)
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
      property: 'noise.lnight.roadsInAgglomeration',
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
