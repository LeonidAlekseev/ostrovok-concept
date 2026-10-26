import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import route from './fixtures/osrm-foot.json'
import { RateGate } from './limits'
import { MAX_WALK_M, parseRoute, routeUrl, walkingRoute } from './osrm'

const cityHall = { lat: 39.4699, lon: -0.3763 }
const beach = { lat: 39.47, lon: -0.326 }
const deps = (fetch: typeof globalThis.fetch) => ({
  budget: { deadline: Date.now() + 9000 },
  gate: new RateGate(),
  fetch,
})

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

// assistant-geo, Requirement: Гео-инструменты Эвала
describe('the walking route', () => {
  it('asks the foot profile of FOSSGIS for GeoJSON', () => {
    expect(routeUrl(cityHall, beach)).toBe(
      'https://routing.openstreetmap.de/routed-foot/route/v1/driving/-0.3763,39.4699;-0.326,39.47' +
        '?overview=full&geometries=geojson&steps=false&alternatives=false',
    )
  })

  it('reads the distance, the time and the line of the route', () => {
    const result = parseRoute(route)
    expect(result).toMatchObject({ ok: true, value: { kind: 'foot', distanceM: 4870, durationS: 3900 } })
    expect(result.ok && result.value.geometry.coordinates[0]).toEqual([-0.376272, 39.469808])
    expect(result.ok && result.value.geometry.type).toBe('LineString')
  })

  it('fails no route and odd answers honestly', () => {
    expect(parseRoute({ code: 'NoRoute', routes: [] })).toMatchObject({ reason: 'not-found' })
    expect(parseRoute({ code: 'InvalidQuery' })).toMatchObject({ reason: 'unavailable', service: 'osrm' })
    expect(parseRoute({ code: 'Ok', routes: [{}] })).toMatchObject({ reason: 'unavailable' })
  })

  it('gives the route when OSRM answers', async () => {
    const result = await walkingRoute(cityHall, beach, deps(vi.fn(async () => Response.json(route))))
    expect(result).toMatchObject({ kind: 'foot', distanceM: 4870 })
  })

  // Scenario: Маршрут не получен
  it('gives the straight line, marked, when OSRM fails or is late', async () => {
    const failed = await walkingRoute(cityHall, beach, deps(vi.fn(async () => new Response('', { status: 503 }))))
    expect(failed).toMatchObject({
      kind: 'straight',
      note: 'по прямой',
      reason: 'Не удалось проверить: сервис маршрутов OpenStreetMap сейчас недоступен.',
    })
    expect(failed.distanceM).toBeGreaterThan(4300)
    expect(failed.distanceM).toBeLessThan(4400)
    expect(failed.durationS).toBe(Math.round(failed.distanceM / (5000 / 3600)))
    expect(failed.geometry.coordinates).toEqual([
      [cityHall.lon, cityHall.lat],
      [beach.lon, beach.lat],
    ])
    const late = await walkingRoute(cityHall, beach, { ...deps(vi.fn()), budget: { deadline: Date.now() + 100 } })
    expect(late).toMatchObject({ kind: 'straight', reason: expect.stringContaining('не ответил вовремя') })
  })

  it('does not ask for a walk to the airport from far away', async () => {
    const fetch = vi.fn()
    const far = await walkingRoute({ lat: 39.4699, lon: -0.3763 }, { lat: 39.6, lon: -0.2 }, deps(fetch))
    expect(far.distanceM).toBeGreaterThan(MAX_WALK_M)
    expect(far).toMatchObject({ kind: 'straight', reason: expect.stringContaining('по прямой') })
    expect(fetch).not.toHaveBeenCalled()
  })
})
