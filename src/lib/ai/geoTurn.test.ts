import type { LanguageModel } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import route from '../geo/fixtures/osrm-foot.json'
import type { PlaceCategory } from '../geo/categories'
import { haversineMeters, type LatLon } from '../geo/distance'
import { RateGate } from '../geo/limits'
import { ATTRIBUTION, type Place, type PlaceStore } from '../geo/places'
import { ok } from '../geo/result'
import type { NearbyPlace } from '../hotelDetails'
import type { ModelLink } from './chain'
import { geoTurn, rulesPlan, tidyPlan, walks } from './geoTurn'

const hotel = { name: 'Hotel Turia', lat: 39.451, lon: -0.3582 }
const at = (lat: number, lon: number) => ({ lat, lon })

interface Row extends LatLon {
  id: number
  name: string | null
  categories: PlaceCategory[]
}

const pharmacy: Row = { id: 1, name: 'Farmacia El Saler', categories: ['pharmacy'], ...at(39.4522, -0.3586) }
const hospital: Row = { id: 2, name: 'Hospital La Fe', categories: ['hospital'], ...at(39.4441, -0.3762) }
const beach: Row = { id: 3, name: 'Platja de Pinedo', categories: ['beach'], ...at(39.4255, -0.3305) }
const port: Row = { id: 4, name: null, categories: ['sea'], ...at(39.4405, -0.3165) }
const airport: Row = { id: 5, name: 'Aeropuerto de Valencia', categories: ['airport'], ...at(39.4893, -0.4816) }

/** The cache in memory: every category is loaded around the hotel, the places are `rows`. */
function store(rows: Row[] = [pharmacy, hospital, beach, port, airport], covered = true) {
  return {
    near: vi.fn<PlaceStore['near']>(async (point, radiusM, categories, perCategory) =>
      ok({
        covered: covered ? [...categories] : [],
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
            .sort((a, b) => a.distanceM - b.distanceM)
            .slice(0, perCategory),
        ),
      }),
    ),
    named: vi.fn<PlaceStore['named']>(async () => ok([])),
    save: vi.fn<PlaceStore['save']>(async () => true),
    addArea: vi.fn<PlaceStore['addArea']>(async () => true),
  }
}

const osrm = vi.fn(async (_url: string | URL | Request) => Response.json(route))
const deps = (s = store()) => ({ store: s, gate: new RateGate(), fetch: osrm as unknown as typeof fetch })
const options = (extra: Partial<Parameters<typeof geoTurn>[2]> = {}) => ({
  deadline: Date.now() + 15_000,
  signal: new AbortController().signal,
  deps: deps(),
  ...extra,
})
const ask = (text: string) => [{ role: 'user' as const, text }]

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
}
/** A model that calls the tools with `calls`. */
const calling = (...calls: { toolName: string; input: unknown }[]) =>
  new MockLanguageModelV4({
    doGenerate: {
      content: calls.map((call, i) => ({
        type: 'tool-call' as const,
        toolCallId: `call-${i}`,
        toolName: call.toolName,
        input: JSON.stringify(call.input),
      })),
      finishReason: { unified: 'tool-calls' as const, raw: undefined },
      usage,
      warnings: [],
    },
  })
const chain = (...models: MockLanguageModelV4[]): ModelLink[] =>
  models.map((model, i) => ({ id: `model-${i + 1}`, model: model as LanguageModel, timeoutMs: 3000 }))

beforeEach(() => {
  osrm.mockClear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

// assistant-geo, Requirement: Гео-шаги в ходе Эвала
describe('the geo steps of a hotel question', () => {
  // Scenario: Сколько идти до аптеки
  it('finds the pharmacy and walks to it by rules without a model', async () => {
    const outcome = (await geoTurn(hotel, ask('Сколько идти до аптеки?'), options()))!
    expect(outcome.planner).toBe('rules')
    expect(outcome.steps).toEqual([
      expect.objectContaining({ agent: 'geo', status: 'done', title: expect.stringContaining('аптека') }),
      expect.objectContaining({ agent: 'geo', status: 'done', title: 'Строю маршрут пешком до «Farmacia El Saler»' }),
    ])
    expect(String(osrm.mock.calls[0][0])).toContain('/routed-foot/')
    expect(outcome.summary).toContain('«Farmacia El Saler», 140 м от отеля по прямой; пешком 4,9 км')
    expect(outcome.map?.points.map((p) => p.label)).toEqual(['Hotel Turia', 'Farmacia El Saler'])
    expect(outcome.map?.routes).toMatchObject([{ mode: 'foot', distanceM: 4870, to: 'Farmacia El Saler' }])
    expect(outcome.map?.attribution).toBe('© OpenStreetMap')
  })

  it('runs the calls the model chose, each a step of its own', async () => {
    const model = calling(
      { toolName: 'nearbyPlaces', input: { categories: ['hospital'], radiusM: 1000 } },
      { toolName: 'nearbyPlaces', input: { categories: ['airport'], radiusM: 20000 } },
    )
    const outcome = (await geoTurn(
      hotel,
      ask('Есть ли больница и далеко ли аэропорт?'),
      options({ models: chain(model) }),
    ))!
    expect(outcome.planner).toBe('model')
    const titles = outcome.steps.map((s) => s.title)
    // The hospital's «рядом» is 3 km whatever radius the model gave.
    expect(titles[0]).toBe('Ищу рядом с отелем: больница — в радиусе 3,0 км')
    expect(titles[1]).toBe('Ищу рядом с отелем: аэропорт — в радиусе 20,0 км')
    expect(titles).toContain('Строю маршрут на машине до «Aeropuerto de Valencia»')
    expect(String(osrm.mock.calls.at(-1)![0])).toContain('/routed-car/')
    expect(outcome.summary).toMatch(/Аэропорт: ближе всего — «Aeropuerto de Valencia».*на машине 4,9 км.*без пробок/)
  })

  it('falls back to the rules when no model chose a call, and says the models are down', async () => {
    const failing = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('boom')
      },
    })
    const outcome = (await geoTurn(hotel, ask('Есть ли рядом аптека?'), options({ models: chain(failing) })))!
    expect(outcome).toMatchObject({ planner: 'rules', modelsDown: true })
    expect(outcome.summary).toContain('Farmacia El Saler')
  })

  // Scenario: Overpass ограничил запросы
  it('tells a limited Overpass honestly, without a place', async () => {
    const s = store([], false)
    s.near.mockImplementation(async (_point, radiusM) => ok({ covered: radiusM === 1 ? ['pharmacy'] : [], places: [] }))
    const overpass = vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '30' } }))
    const outcome = (await geoTurn(
      hotel,
      ask('Есть ли рядом бар?'),
      options({ deps: { store: s, gate: new RateGate(), fetch: overpass as unknown as typeof fetch } }),
    ))!
    expect(outcome.steps[0]).toMatchObject({ status: 'failed', result: expect.stringContaining('подождите 30 с') })
    expect(outcome.summary).toContain('подождите 30 с')
    expect(outcome.map).toBeUndefined()
  })

  // Scenario: Отель вне загруженных данных
  it('gives no steps for a hotel outside the loaded data without Ostrovok places', async () => {
    expect(await geoTurn(hotel, ask('Есть ли рядом аптека?'), options({ deps: deps(store([], false)) }))).toBeNull()
  })

  it('takes a place the model geocoded at the hotel for the hotel itself', async () => {
    const s = store()
    s.named.mockResolvedValue(
      ok([
        {
          osmType: 'node',
          osmId: 9,
          name: 'Hotel Turia',
          displayName: 'Hotel Turia, Valencia',
          categories: ['other'],
          tags: {},
          ...at(39.451, -0.3583),
        },
      ]),
    )
    const model = calling({ toolName: 'geocode', input: { query: 'Hotel Turia' } })
    const outcome = (await geoTurn(
      hotel,
      ask('Сколько до Hotel Turia?'),
      options({ models: chain(model), deps: deps(s) }),
    ))!
    expect(outcome.steps[0]).toMatchObject({ title: 'Ищу на карте «Hotel Turia»', result: 'это сам отель' })
    expect(outcome.map).toBeUndefined()
  })
})

// assistant-geo, Requirement: До моря по пляжу
describe('the sea', () => {
  // Scenario: Порт ближе пляжа
  it('is the nearest beach, not the coastline of the port', async () => {
    const outcome = (await geoTurn(hotel, ask('Сколько до моря?'), options()))!
    expect(outcome.summary).toContain('Море (ближайший пляж): ближе всего — «Platja de Pinedo»')
    expect(outcome.summary).not.toContain('берег')
    expect(outcome.map?.points.map((p) => p.label)).toEqual(['Hotel Turia', 'Platja de Pinedo'])
  })

  it('is the coastline when no beach is near', async () => {
    const outcome = (await geoTurn(hotel, ask('Сколько до моря?'), options({ deps: deps(store([port])) })))!
    expect(outcome.summary).toContain('Берег моря: ближе всего — «Берег моря»')
  })
})

// assistant-geo, Requirement: Гео-шаги в ходе Эвала (места Островка первыми)
describe('the Ostrovok places', () => {
  const airportOstrovok: NearbyPlace = {
    id: 6077,
    name: 'Валенсия',
    kind: 'Аэропорт',
    distanceM: 10_900,
    bearingDeg: 280,
    lat: 39.4893,
    lon: -0.4816,
    transport: true,
  }

  it('come first; OpenStreetMap does not repeat their kind', async () => {
    const outcome = (await geoTurn(hotel, ask('Как далеко аэропорт?'), options({ ostrovok: [airportOstrovok] })))!
    expect(outcome.steps[0]).toMatchObject({ title: 'Смотрю места рядом по данным Островка', result: 'аэропорт — 1' })
    expect(outcome.summary).toMatch(/^По данным Островка:\n• Аэропорт: ближе всего — «Валенсия» \(аэропорт\), 10,9 км/)
    expect(outcome.summary).not.toContain('Aeropuerto')
    expect(outcome.map?.points[1]).toMatchObject({ label: 'Валенсия', source: 'ostrovok' })
  })

  it('answer alone outside the loaded OSM data', async () => {
    const outcome = (await geoTurn(
      hotel,
      ask('Как далеко аэропорт?'),
      options({ deps: deps(store([], false)), ostrovok: [airportOstrovok] }),
    ))!
    expect(outcome.steps.map((s) => s.title)).toEqual([
      'Смотрю места рядом по данным Островка',
      'Строю маршрут на машине до «Валенсия»',
    ])
  })
})

describe('the plan', () => {
  it('asks the near kinds in their radius and the far ones in 20 km', () => {
    expect(rulesPlan('Есть ли рядом аптека и далеко ли аэропорт?')).toEqual([
      { tool: 'nearbyPlaces', categories: ['pharmacy'], radiusM: 1500 },
      { tool: 'nearbyPlaces', categories: ['airport'], radiusM: 20_000 },
    ])
    expect(rulesPlan('Что рядом?')[0]).toMatchObject({
      categories: ['attraction', 'restaurant', 'supermarket', 'pharmacy', 'metro'],
    })
  })

  it('makes the model’s calls safe', () => {
    expect(
      tidyPlan(
        [
          { tool: 'geocode', query: 'аэропорт Валенсии' },
          { tool: 'nearbyPlaces', categories: ['sea'], radiusM: 1000 },
          { tool: 'nearbyPlaces', categories: ['sea'], radiusM: 1000 },
        ],
        'Далеко ли аэропорт и море, есть ли аптека?',
      ),
    ).toEqual([
      { tool: 'nearbyPlaces', categories: ['airport'], radiusM: 20_000 },
      { tool: 'nearbyPlaces', categories: ['beach', 'sea'], radiusM: 20_000 },
      { tool: 'nearbyPlaces', categories: ['pharmacy'], radiusM: 1500 },
    ])
  })

  it('keeps a turn to six kinds of places', () => {
    const [call] = tidyPlan(
      [
        {
          tool: 'nearbyPlaces',
          categories: ['hospital', 'clinic', 'pharmacy', 'bar', 'nightclub', 'restaurant', 'cafe', 'metro'],
          radiusM: 1000,
        },
      ],
      'Что рядом?',
    )
    expect(call).toMatchObject({ categories: ['hospital', 'clinic', 'pharmacy', 'bar', 'nightclub', 'restaurant'] })
  })

  it('walks or drives as the question says', () => {
    expect(walks(2000, 'Что рядом?')).toBe(true)
    expect(walks(4000, 'Что рядом?')).toBe(false)
    expect(walks(4000, 'Сколько идти до рынка?')).toBe(true)
    expect(walks(1000, 'Сколько ехать на такси?')).toBe(false)
  })
})
