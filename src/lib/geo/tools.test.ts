import { describe, expect, it, vi } from 'vitest'
import { RateGate } from './limits'
import route from './fixtures/osrm-foot.json'
import type { PlaceStore } from './places'
import { ok } from './result'
import { geoTools } from './tools'

const store: PlaceStore = {
  near: vi.fn(async () => ok({ covered: ['pharmacy' as const], places: [] })),
  named: vi.fn(async () => ok([])),
  save: vi.fn(async () => true),
  addArea: vi.fn(async () => true),
}
const options = { toolCallId: 'call', messages: [], context: {} } as never

// assistant-geo, Requirement: Гео-инструменты Эвала
describe('the geo tools of the AI SDK', () => {
  it('describes four tools with zod schemas', () => {
    const tools = geoTools({ deadline: Date.now() + 9000 }, { store, gate: new RateGate() })
    expect(Object.keys(tools)).toEqual(['geocode', 'reverseGeocode', 'nearbyPlaces', 'walkingRoute'])
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
})
