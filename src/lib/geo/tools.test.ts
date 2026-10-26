import { describe, expect, it, vi } from 'vitest'
import { RateGate } from './limits'
import route from './fixtures/osrm-foot.json'
import type { PlaceStore } from './places'
import { ok } from './result'
import { geoTools, NOMINATIM_ONCE, newGeoSession } from './tools'

const store: PlaceStore = {
  near: vi.fn(async () => ok({ covered: ['pharmacy' as const], places: [] })),
  named: vi.fn(async () => ok([])),
  save: vi.fn(async () => true),
  addArea: vi.fn(async () => true),
}
const options = { toolCallId: 'call', messages: [], context: {} } as never

// assistant-geo, Requirement: Гео-инструменты Эвала
describe('the geo tools of the AI SDK', () => {
  it('describes five tools with zod schemas', () => {
    const tools = geoTools({ deadline: Date.now() + 9000 }, { store, gate: new RateGate() })
    expect(Object.keys(tools)).toEqual(['geocode', 'reverseGeocode', 'nearbyPlaces', 'walkingRoute', 'drivingRoute'])
    for (const t of Object.values(tools)) expect(t.description).toBeTruthy()
  })

  it('checks the input: known categories, a sane radius', async () => {
    const { nearbyPlaces } = geoTools({ deadline: Date.now() + 9000 }, { store, gate: new RateGate() })
    const schema = nearbyPlaces.inputSchema as unknown as {
      safeParse: (v: unknown) => { success: boolean; data?: unknown }
    }
    expect(schema.safeParse({ lat: 39.47, lon: -0.37, categories: ['pharmacy'] })).toMatchObject({
      success: true,
      data: { radiusM: 1000, perCategory: 3 },
    })
    expect(schema.safeParse({ lat: 39.47, lon: -0.37, categories: ['casino'] }).success).toBe(false)
    expect(schema.safeParse({ lat: 39.47, lon: -0.37, categories: ['bar'], radiusM: 10 }).success).toBe(false)
    expect(schema.safeParse({ lat: 139, lon: -0.37, categories: ['bar'] }).success).toBe(false)
  })

  it('answers the places near a point from the cache', async () => {
    const { nearbyPlaces } = geoTools({ deadline: Date.now() + 9000 }, { store, gate: new RateGate() })
    const result = await nearbyPlaces.execute!(
      { lat: 39.47, lon: -0.37, categories: ['pharmacy', 'pharmacy'], radiusM: 500, perCategory: 3 },
      options,
    )
    expect(result).toMatchObject({ radiusM: 500, groups: [{ category: 'pharmacy', status: 'none' }] })
  })

  it('gives a route with GeoJSON for the map', async () => {
    const fetch = vi.fn(async () => Response.json(route))
    const { walkingRoute } = geoTools({ deadline: Date.now() + 9000 }, { store, gate: new RateGate(), fetch })
    const result = await walkingRoute.execute!(
      { from: { lat: 39.4699, lon: -0.3763 }, to: { lat: 39.47, lon: -0.326 } },
      options,
    )
    expect(result).toMatchObject({ kind: 'foot', distanceM: 4870, geometry: { type: 'LineString' } })
  })

  // Scenario: На машине до аэропорта
  it('gives a route by car from the car profile', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request) => Response.json(route))
    const { drivingRoute } = geoTools({ deadline: Date.now() + 9000 }, { store, gate: new RateGate(), fetch })
    const result = await drivingRoute.execute!(
      { from: { lat: 39.4699, lon: -0.3763 }, to: { lat: 39.4893, lon: -0.4816 } },
      options,
    )
    expect(String(fetch.mock.calls[0][0])).toContain('/routed-car/')
    expect(result).toMatchObject({ kind: 'car', distanceM: 4870, geometry: { type: 'LineString' } })
  })

  // Scenario: Второй поиск адреса за ход
  it('asks Nominatim once a turn', async () => {
    const fetch = vi.fn(async () => Response.json([]))
    const session = newGeoSession()
    const deps = { store, gate: new RateGate(), fetch }
    const first = geoTools({ deadline: Date.now() + 9000, session }, deps)
    await first.geocode.execute!({ query: 'Mercado Central' }, options)
    const second = geoTools({ deadline: Date.now() + 9000, session }, deps)
    expect(await second.geocode.execute!({ query: 'Oceanogràfic' }, options)).toEqual(NOMINATIM_ONCE)
    expect(await second.reverseGeocode.execute!({ lat: 39.47, lon: -0.37 }, options)).toEqual(NOMINATIM_ONCE)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
