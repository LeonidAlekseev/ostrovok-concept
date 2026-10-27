import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaceCategory } from '../geo/categories'
import { haversineMeters, type LatLon } from '../geo/distance'
import { RateGate } from '../geo/limits'
import { ATTRIBUTION, type Place, type PlaceStore } from '../geo/places'
import { ok } from '../geo/result'
import type { HotelDetails } from '../hotelDetails'
import { isHotelGeoQuestion, isHotelViewQuestion, isNoiseQuestion } from '../noise'
import { RAY_BEARINGS, type HotelView, type SightLine } from '../view'
import { floorOf, placeQuery, viewTurn } from './viewTurn'

const hotel = { id: 'ota-1', name: 'Hotel Turia', lat: 39.4735, lon: -0.3799 }

const line = (over: Partial<SightLine> = {}): SightLine => ({
  distanceM: 1500,
  checked: true,
  crossed: 4,
  maxAngle: -2,
  maxAngleUpper: -1.5,
  firstAboveM: null,
  coveredM: 1500,
  blocker: { id: 'b1', distanceM: 300, heightM: 45, estimated: true },
  targetBuilding: null,
  ...over,
})

const details = (over: Partial<HotelDetails> = {}): HotelDetails => ({
  description: [],
  amenityGroups: [],
  policies: [],
  notes: null,
  facts: { rooms: null, roomFloors: null, yearBuilt: null, yearRenovated: null, electricity: null },
  building: { floors: 12, heightM: 36, estimated: false, heightEstimated: true },
  scores: [],
  reviews: [],
  nearby: [
    {
      id: 7,
      name: 'Hospital Clínico',
      kind: 'Больница',
      distanceM: 900,
      bearingDeg: 40,
      lat: 39.48,
      lon: -0.37,
      transport: false,
    },
  ],
  viewQuotes: [{ reviewId: 'r1', source: 'ostrovok', author: 'Анна', text: 'Из окна видно море' }],
  ...over,
})

const view: HotelView = {
  observer: { floor: 12, floors: 12, heightM: 36, heightEstimated: true, eyeM: 34.5 },
  floors: [],
  // The west is closed: a building of 45 m 300 m away.
  rays: RAY_BEARINGS.map((bearing) => ({
    bearing,
    line: bearing > 200 && bearing < 320 ? line({ maxAngle: 1.9, maxAngleUpper: 3 }) : line(),
  })),
  sea: [
    {
      kind: 'sea',
      name: 'Берег моря',
      category: 'море',
      lat: 39.46,
      lon: -0.331,
      distanceM: 4430,
      bearing: 110,
      line: line({ distanceM: 4430, coveredM: 4430, maxAngle: -0.5, maxAngleUpper: -0.4 }),
    },
  ],
  seaChecked: true,
  landmarks: [
    {
      kind: 'attraction',
      name: 'Torres de Serranos',
      category: 'достопримечательность',
      lat: 39.479,
      lon: -0.376,
      distanceM: 700,
      bearing: 20,
      line: line({ distanceM: 700, coveredM: 700, targetBuilding: { id: 't', heightM: 33, estimated: false } }),
    },
  ],
  windowSides: [],
}

/** The OSM cache in memory with a hospital. */
function store(): PlaceStore {
  const rows: (LatLon & { id: number; name: string; categories: PlaceCategory[] })[] = [
    { id: 2, name: 'Hospital La Fe', categories: ['hospital'], lat: 39.46, lon: -0.3762 },
  ]
  return {
    near: vi.fn<PlaceStore['near']>(async (point, radiusM, categories, perCategory) =>
      ok({
        covered: [...categories],
        places: categories.flatMap((category) =>
          rows
            .filter((r) => r.categories.includes(category))
            .map((r): Place => ({
              osmType: 'node',
              osmId: r.id,
              name: r.name,
              category,
              categories: r.categories,
              tags: {},
              lat: r.lat,
              lon: r.lon,
              distanceM: Math.round(haversineMeters(point, r)),
              near: { lat: r.lat, lon: r.lon },
              origin: 'preload',
              attribution: ATTRIBUTION,
            }))
            .filter((p) => p.distanceM <= radiusM)
            .slice(0, perCategory),
        ),
      }),
    ),
    named: vi.fn<PlaceStore['named']>(async () => ok([])),
    save: vi.fn<PlaceStore['save']>(async () => true),
    addArea: vi.fn<PlaceStore['addArea']>(async () => true),
  }
}

const loadView = vi.fn(async () => view)
const checkPoints = vi.fn(async (_hotel: unknown, _eye: number, points: readonly LatLon[]) =>
  points.map(() => line({ maxAngle: 0.5, maxAngleUpper: 1 })),
)
const options = (over: Partial<Parameters<typeof viewTurn>[2]> = {}) => ({
  deadline: Date.now() + 15_000,
  signal: new AbortController().signal,
  details: details(),
  date: '2026-06-21',
  // No service is asked over the network: a call that gets this far fails.
  deps: { store: store(), gate: new RateGate(), fetch: (async () => Response.error()) as typeof fetch },
  loadView: loadView as never,
  checkPoints: checkPoints as never,
  ...over,
})
const ask = (text: string) => [{ role: 'user' as const, text }]

beforeEach(() => {
  loadView.mockClear()
  checkPoints.mockClear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

// assistant-geo, Requirement: Вид из окна в ответе Эвала
describe('the view steps of a hotel question', () => {
  it('tells whether the sea is seen, with the window, the reason and the guests’ words', async () => {
    const outcome = await viewTurn(hotel, ask('Видно ли море из окна?'), options())
    expect(outcome.steps.map((s) => [s.title, s.status])).toEqual([
      ['Смотрю высоту здания отеля по EUBUCCO', 'done'],
      ['Проверяю линии взгляда над зданиями', 'done'],
    ])
    expect(outcome.summary).toContain('Из окна (окно 12-го этажа, ≈ 34,5 м над землёй; здание 12 этажей, ≈ 36 м')
    expect(outcome.summary).toContain('• Море (берег в 4,4 км, азимут 110° (восток)): вероятно видно.')
    expect(outcome.summary).toContain('Гость о виде (Анна): «Из окна видно море»')
    expect(outcome.map?.points.map((p) => [p.label, p.category])).toEqual([
      ['Hotel Turia', undefined],
      ['Берег моря', 'море · вероятно видно'],
    ])
  })

  it('checks the sunset of the date from the floor asked', async () => {
    const outcome = await viewTurn(hotel, ask('А с 3 этажа закат видно?'), options())
    expect(loadView).toHaveBeenCalledWith(hotel, expect.anything(), expect.anything(), 3)
    expect(outcome.summary).toContain('• Закат 21 июня в 21:32, азимут 302° (северо-запад): возможны препятствия')
    expect(outcome.summary).toContain('мешает здание ≈ 45 м (по оценке EUBUCCO) в 300 м от отеля')
  })

  it('finds a kind of place among the Ostrovok places first, then in OSM, and checks the lines to them', async () => {
    const outcome = await viewTurn(hotel, ask('Видна ли больница из номера?'), options())
    expect(checkPoints.mock.calls[0].slice(1)).toMatchObject([34.5, [{ lat: 39.48, lon: -0.37 }]])
    expect(outcome.summary).toMatch(/• «Hospital Clínico» \(больница, .*\): возможны препятствия/)
    expect(outcome.steps.at(-1)).toMatchObject({ title: 'Проверяю, видно ли из окна: «Hospital Clínico»' })
    const osm = await viewTurn(hotel, ask('Видна ли больница?'), options({ details: details({ nearby: [] }) }))
    expect(osm.steps.map((s) => s.title)).toContain('Ищу рядом с отелем: больница')
    expect(osm.summary).toContain('«Hospital La Fe»')
  })

  it('names a landmark of the page without looking it up', async () => {
    const outcome = await viewTurn(hotel, ask('Видно ли Torres de Serranos?'), options())
    expect(checkPoints).not.toHaveBeenCalled()
    expect(outcome.summary).toMatch(/• «Torres de Serranos» \(достопримечательность, 700 м, .*\): вероятно видно\./)
  })

  it('looks a named place up and checks the line to it', async () => {
    const s = store()
    vi.mocked(s.named).mockResolvedValue(
      ok([
        {
          osmType: 'way',
          osmId: 1,
          name: 'Ciutat de les Arts i les Ciències',
          displayName: 'Ciutat de les Arts i les Ciències, València',
          lat: 39.4547,
          lon: -0.3507,
          categories: ['other'],
          tags: {},
        },
      ]),
    )
    const outcome = await viewTurn(
      hotel,
      ask('Видно ли Город искусств и наук из окна?'),
      options({ deps: { store: s, gate: new RateGate() } }),
    )
    expect(s.named).toHaveBeenCalledWith('Город искусств и наук', expect.anything())
    expect(outcome.steps.map((step) => step.title)).toEqual([
      'Смотрю высоту здания отеля по EUBUCCO',
      'Проверяю линии взгляда над зданиями',
      'Ищу на карте «Город искусств и наук»',
      'Проверяю, видно ли из окна: «Ciutat de les Arts i les Ciències»',
    ])
    expect(outcome.summary).toMatch(/• «Ciutat de les Arts i les Ciències» \(место, .*\): возможны препятствия/)
  })

  it('says so when the named place is not found', async () => {
    const outcome = await viewTurn(hotel, ask('Видно ли Несуществующую башню?'), options())
    expect(outcome.steps.at(-1)).toMatchObject({ title: 'Ищу на карте «Несуществующую башню»', status: 'failed' })
    expect(outcome.summary).toMatch(/• «Несуществующую башню»: /)
    expect(checkPoints).not.toHaveBeenCalled()
  })

  it('says «недостаточно данных» without a reliable height of the building', async () => {
    const outcome = await viewTurn(hotel, ask('Видно ли море?'), options({ details: details({ building: null }) }))
    expect(loadView).not.toHaveBeenCalled()
    expect(outcome.steps).toEqual([expect.objectContaining({ status: 'failed', result: 'нет надёжной высоты здания' })])
    expect(outcome.summary).toMatch(/^Недостаточно данных: высоты здания отеля нет в EUBUCCO или она сомнительна/)
  })

  it('answers «какой вид» with the sea, the sunset and the landmarks seen', async () => {
    const outcome = await viewTurn(hotel, ask('Какой вид из окна?'), options())
    expect(outcome.summary).toContain('• Море (берег в 4,4 км')
    expect(outcome.summary).toContain('• Закат 21 июня')
    expect(outcome.summary).toContain('«Torres de Serranos»')
  })
})

describe('the words of a view question', () => {
  it('give the floor and the place’s name', () => {
    expect([floorOf('с 5 этажа'), floorOf('на 12-м этаже'), floorOf('из окна')]).toEqual([5, 12, null])
    expect(placeQuery('Видно ли Город искусств и наук из окна?')).toBe('Город искусств и наук')
    expect(placeQuery('Какой вид из окна?')).toBeNull()
  })

  // assistant-search, Requirement: Вопросы о виде отдельно от гео- и шумовых
  it('route the view apart from the noise and the places near', () => {
    for (const text of ['Видно ли море из окна?', 'Будет ли виден закат?', 'Видна ли больница рядом?'])
      expect([isHotelViewQuestion(text), isHotelGeoQuestion(text), isNoiseQuestion(text)]).toEqual([true, false, false])
    expect([isHotelViewQuestion('Шумно ли из окна?'), isNoiseQuestion('Шумно ли из окна?')]).toEqual([false, true])
    expect([isHotelViewQuestion('Есть ли рядом больница?'), isHotelGeoQuestion('Есть ли рядом больница?')]).toEqual([
      false,
      true,
    ])
  })
})
