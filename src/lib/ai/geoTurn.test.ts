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
import { PLAN_MS, REMARK_MS, geoTurn, remarkModels, rulesPlan, tidyPlan, walks } from './geoTurn'
import { REMARK_MODEL_ID } from './model'
import { MODEL_TIMEOUT_MS } from './understand'

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

// assistant-geo, Requirement: Гео-шаги в ходе Эвала
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

  it('come first; OpenStreetMap does not repeat their places', async () => {
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

// assistant-geo, Requirement: Одно место Островка и OpenStreetMap
describe('a place of Ostrovok and OpenStreetMap', () => {
  const nearLonja = { name: 'Hotel Lonja', lat: 39.4737, lon: -0.377 }
  const lonja: NearbyPlace = {
    id: 6160500,
    name: 'Ла-Лонья',
    nameEn: 'La Lonja',
    // The Ostrovok place «Лонха-де-ла-Седа», 53 m away, folded into it (`nearbyOf`).
    aliases: ['Лонха-де-ла-Седа', 'La Lonja de la Seda de Valencia'],
    kind: 'Достопримечательность',
    distanceM: 150,
    bearingDeg: 280,
    lat: 39.4741249,
    lon: -0.378566,
    transport: false,
  }
  const llotja: Row = {
    id: 23377876,
    name: 'Llotja de la Seda',
    categories: ['attraction'],
    ...at(39.4744082, -0.3784312),
  }
  const towers: Row = { id: 7, name: 'Torres de Quart', categories: ['attraction'], ...at(39.4757, -0.3838) }

  it('is named once, by Ostrovok, in the answer and on the map; OSM adds the places Ostrovok has not', async () => {
    const outcome = (await geoTurn(
      nearLonja,
      ask('Какие достопримечательности рядом?'),
      options({ deps: deps(store([llotja, towers])), ostrovok: [lonja] }),
    ))!
    expect(outcome.summary).toMatch(
      /^По данным Островка и OpenStreetMap:\n• Достопримечательность: ближе всего — «Ла-Лонья» \(достопримечательность\), 150 м от отеля; пешком/,
    )
    expect(outcome.summary).toContain('Ещё: «Torres de Quart» — 630 м.')
    expect(outcome.summary).not.toContain('Llotja')
    expect(outcome.map?.points.map((p) => p.label)).toEqual(['Hotel Lonja', 'Ла-Лонья', 'Torres de Quart'])
  })

  it('leaves a nearer hospital of OSM before the one Ostrovok lists', async () => {
    const university: NearbyPlace = {
      id: 1,
      name: 'University Hospital',
      kind: 'Больница',
      distanceM: 2900,
      bearingDeg: 0,
      lat: 39.4771,
      lon: -0.3582,
      transport: false,
    }
    const outcome = (await geoTurn(hotel, ask('Где ближайшая больница?'), options({ ostrovok: [university] })))!
    expect(outcome.summary).toContain(
      '• Больница: ближе всего — «Hospital La Fe», 1,7 км от отеля по прямой; пешком 4,9 км, около 1 ч 5 мин. Ещё: «University Hospital» — 2,9 км.',
    )
  })
})

// assistant-geo, Requirement: Вывод Эвала поверх фактов
describe('the remark over the facts', () => {
  /** A model that chooses the rules' calls and then says `remark`. */
  const remarking = (remark: string) =>
    new MockLanguageModelV4({
      doGenerate: async (call) =>
        call.tools?.length
          ? {
              content: [
                {
                  type: 'tool-call' as const,
                  toolCallId: 'call-0',
                  toolName: 'nearbyPlaces',
                  input: JSON.stringify({ categories: ['pharmacy'], radiusM: 1000 }),
                },
              ],
              finishReason: { unified: 'tool-calls' as const, raw: undefined },
              usage,
              warnings: [],
            }
          : {
              content: [{ type: 'text' as const, text: remark }],
              finishReason: { unified: 'stop' as const, raw: undefined },
              usage,
              warnings: [],
            },
    })

  it('is added after the facts when it passes the checks', async () => {
    const outcome = (await geoTurn(
      hotel,
      ask('Есть ли рядом аптека?'),
      options({ models: chain(remarking('Аптека совсем рядом — за лекарствами можно сходить пешком.')) }),
    ))!
    expect(outcome.remark).toBe('Аптека совсем рядом — за лекарствами можно сходить пешком.')
    expect(outcome.summary.split('\n').slice(-2)).toEqual([
      'Аптека совсем рядом — за лекарствами можно сходить пешком.',
      'Места и маршруты — на карте ниже.',
    ])
  })

  // assistant-geo, Requirement: Проверка фразы
  it('is dropped when it gives a number of its own, and the facts answer alone', async () => {
    const outcome = (await geoTurn(
      hotel,
      ask('Есть ли рядом аптека?'),
      options({ models: chain(remarking('До аптеки минуты три пешком.')) }),
    ))!
    expect(outcome).toMatchObject({ remarkDropped: true })
    expect(outcome.remark).toBeUndefined()
    expect(outcome.summary).not.toContain('минуты три')
  })

  it('is not asked of the models that could not choose the calls', async () => {
    const failing = vi.fn(async () => {
      throw new Error('boom')
    })
    await geoTurn(
      hotel,
      ask('Есть ли рядом аптека?'),
      options({ models: chain(new MockLanguageModelV4({ doGenerate: failing })) }),
    )
    expect(failing).toHaveBeenCalledTimes(1)
  })

  it('is asked of the model of the remarks first', () => {
    const links = ['lightning', REMARK_MODEL_ID, 'flash'].map((id) => ({ id, model: calling(), timeoutMs: 1000 }))
    expect(remarkModels(links).map((m) => m.id)).toEqual([REMARK_MODEL_ID, 'lightning', 'flash'])
  })

  it('keeps the model time of a turn within the text models’ 9 s', () => {
    expect(PLAN_MS + REMARK_MS).toBeLessThanOrEqual(MODEL_TIMEOUT_MS)
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
