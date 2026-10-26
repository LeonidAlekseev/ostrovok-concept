import { describe, expect, it, vi } from 'vitest'
import type { PlaceCategory } from './categories'
import { haversineMeters, type LatLon } from './distance'
import type { GeocodedPlace } from './nominatim'
import type { OsmPlaceRow } from './overpass'
import { ATTRIBUTION, geocode, nearbyPlaces, type Place, type PlaceStore } from './places'
import { limited, notFound, ok, unavailable } from './result'

const hotel = { lat: 39.4699, lon: -0.3763 }
const budget = { deadline: Date.now() + 9000 }

const row = (id: number, categories: PlaceCategory[], at: LatLon, name = `place ${id}`): OsmPlaceRow => ({
  osm_type: 'node',
  osm_id: id,
  name,
  categories,
  tags: { name },
  ...at,
  geom: `SRID=4326;POINT(${at.lon} ${at.lat})`,
})

/**
 * The cache in memory, as the RPCs answer: the places within the circle, nearest first, and the categories of the
 * recorded circles that cover the asked one (same centre, radius at least as large).
 */
function memoryStore(
  rows: OsmPlaceRow[] = [],
  areas: { at: LatLon; radiusM: number; categories: PlaceCategory[] }[] = [],
) {
  const saved: OsmPlaceRow[] = [...rows]
  const store = {
    near: vi.fn<PlaceStore['near']>(async (point, radiusM, categories, perCategory) => {
      const covered = categories.filter((c) =>
        areas.some((a) => a.categories.includes(c) && haversineMeters(a.at, point) + radiusM <= a.radiusM + 1e-6),
      )
      const places = categories.flatMap((category) =>
        saved
          .filter((r) => r.categories.includes(category))
          .map((r): Place => ({
            osmType: r.osm_type,
            osmId: r.osm_id,
            name: r.name,
            category,
            categories: r.categories,
            tags: r.tags,
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
      )
      return ok({ covered, places })
    }),
    named: vi.fn<PlaceStore['named']>(async () => ok([])),
    save: vi.fn<PlaceStore['save']>(async (more) => {
      saved.push(...more)
      return true
    }),
    addArea: vi.fn<PlaceStore['addArea']>(async (at, radiusM, categories) => {
      areas.push({ at, radiusM, categories: [...categories] })
      return true
    }),
  }
  return { store, saved, areas }
}

const near = (lat: number, lon: number) => ({ lat, lon })
const valencia = { at: hotel, radiusM: 30_000, categories: ['pharmacy', 'bar', 'nightclub', 'sea'] as PlaceCategory[] }

// assistant-geo, Requirement: Кэш мест OpenStreetMap
describe('the places near a hotel', () => {
  // Scenario: Предзагруженная Валенсия
  it('answers the loaded Valencia from the cache, without OSM', async () => {
    const { store } = memoryStore(
      [
        row(1, ['pharmacy'], near(39.4705, -0.3765)),
        row(2, ['pharmacy'], near(39.472, -0.377)),
        row(3, ['bar'], near(39.471, -0.375)),
      ],
      [valencia],
    )
    const overpass = vi.fn()
    const result = await nearbyPlaces(
      hotel,
      ['pharmacy', 'bar'],
      { radiusM: 500, perCategory: 3 },
      { store, overpass, budget },
    )
    expect(overpass).not.toHaveBeenCalled()
    expect(result.groups.map((g) => [g.category, g.status, g.places.map((p) => p.osmId)])).toEqual([
      ['pharmacy', 'found', [1, 2]],
      ['bar', 'found', [3]],
    ])
    expect(result.groups[0].label).toBe('аптека')
    expect(result.attribution).toBe('© OpenStreetMap contributors, ODbL 1.0')
  })

  // Scenario: Рядом ничего нет
  it('says none for a loaded area with nothing within the radius', async () => {
    const { store } = memoryStore([row(4, ['nightclub'], near(39.49, -0.35))], [valencia])
    const overpass = vi.fn()
    const result = await nearbyPlaces(
      hotel,
      ['nightclub'],
      { radiusM: 300, perCategory: 3 },
      { store, overpass, budget },
    )
    expect(result.groups[0]).toMatchObject({ status: 'none', places: [] })
    expect(result.groups[0].failure).toBeUndefined()
    expect(overpass).not.toHaveBeenCalled()
  })
})

// assistant-geo, Requirement: Дозапись мест из OSM
describe('the places the cache does not cover', () => {
  const madrid = { lat: 40.4168, lon: -3.7038 }

  // Scenario: Точка вне загруженной области
  it('asks Overpass once, writes what it finds and the circle, and answers the next time from the cache', async () => {
    const { store, saved, areas } = memoryStore([], [valencia])
    const found = [row(10, ['bar'], near(40.417, -3.704), 'Bar Madrid'), row(11, ['bar'], near(40.43, -3.704))]
    const overpass = vi.fn(async () => ok(found))
    const first = await nearbyPlaces(madrid, ['bar'], { radiusM: 800, perCategory: 3 }, { store, overpass, budget })
    expect(overpass).toHaveBeenCalledWith(['bar'], { around: { ...madrid, radiusM: 800 } }, budget)
    expect(store.save).toHaveBeenCalledWith(found, 'online')
    expect(saved.map((r) => r.osm_id)).toEqual([10, 11])
    expect(areas.at(-1)).toEqual({ at: madrid, radiusM: 800, categories: ['bar'] })
    expect(first.groups[0]).toMatchObject({ status: 'found', places: [{ osmId: 10, name: 'Bar Madrid' }] })

    const second = await nearbyPlaces(madrid, ['bar'], { radiusM: 800, perCategory: 3 }, { store, overpass, budget })
    expect(overpass).toHaveBeenCalledTimes(1)
    expect(second.groups[0].places.map((p) => p.osmId)).toEqual([10])
  })

  it('records an empty answer as checked: nothing to write, nothing to ask again', async () => {
    const { store } = memoryStore()
    const overpass = vi.fn(async () => ok([]))
    const result = await nearbyPlaces(
      madrid,
      ['hospital'],
      { radiusM: 500, perCategory: 3 },
      { store, overpass, budget },
    )
    expect(result.groups[0]).toMatchObject({ status: 'none' })
    expect(store.save).not.toHaveBeenCalled()
    expect(store.addArea).toHaveBeenCalledWith(madrid, 500, ['hospital'])
    await nearbyPlaces(madrid, ['hospital'], { radiusM: 500, perCategory: 3 }, { store, overpass, budget })
    expect(overpass).toHaveBeenCalledTimes(1)
  })

  it('asks only the categories the cache does not cover', async () => {
    const { store } = memoryStore([row(1, ['pharmacy'], near(39.4705, -0.3765))], [valencia])
    const overpass = vi.fn(async () => ok([]))
    await nearbyPlaces(hotel, ['pharmacy', 'museum'], { radiusM: 500, perCategory: 3 }, { store, overpass, budget })
    expect(overpass).toHaveBeenCalledWith(['museum'], expect.anything(), budget)
  })

  it('measures the rows itself when the cache cannot write them', async () => {
    const { store } = memoryStore()
    store.save.mockResolvedValue(false)
    const overpass = vi.fn(async () => ok([row(12, ['cafe'], near(40.4172, -3.7038))]))
    const result = await nearbyPlaces(madrid, ['cafe'], { radiusM: 500, perCategory: 3 }, { store, overpass, budget })
    expect(store.addArea).not.toHaveBeenCalled()
    expect(result.groups[0].places).toMatchObject([{ osmId: 12, origin: 'online', distanceM: 44 }])
  })

  // assistant-geo, Requirement: Честные ошибки и лимиты OSM — Scenario: Сервис перегружен
  it('leaves the categories unchecked with the failure when Overpass does not answer, never a guess', async () => {
    const { store } = memoryStore()
    const overpass = vi.fn(async () => unavailable('overpass'))
    const result = await nearbyPlaces(
      madrid,
      ['bar', 'pharmacy'],
      { radiusM: 500, perCategory: 3 },
      { store, overpass, budget },
    )
    expect(result.groups).toMatchObject([
      { category: 'bar', status: 'unchecked', places: [], failure: { reason: 'unavailable' } },
      { category: 'pharmacy', status: 'unchecked', places: [] },
    ])
    expect(store.save).not.toHaveBeenCalled()
  })

  it('gives the wait of a limited Overpass', async () => {
    const { store } = memoryStore()
    const overpass = vi.fn(async () => limited('overpass', 30))
    const result = await nearbyPlaces(madrid, ['bar'], { radiusM: 500, perCategory: 3 }, { store, overpass, budget })
    expect(result.groups[0].failure?.message).toBe('Сервис мест OpenStreetMap ограничил запросы, подождите 30 с.')
  })

  it('asks Overpass when the cache itself is down', async () => {
    const { store } = memoryStore()
    store.near.mockResolvedValue(unavailable('database'))
    const overpass = vi.fn(async () => ok([row(13, ['bar'], near(40.4169, -3.7038))]))
    store.save.mockResolvedValue(false)
    const result = await nearbyPlaces(madrid, ['bar'], { radiusM: 500, perCategory: 3 }, { store, overpass, budget })
    expect(result.groups[0]).toMatchObject({ status: 'found', places: [{ osmId: 13 }] })
  })

  it('does not ask Overpass for a large radius outside the cache', async () => {
    const { store } = memoryStore()
    const overpass = vi.fn()
    const result = await nearbyPlaces(
      madrid,
      ['airport'],
      { radiusM: 20_000, perCategory: 1 },
      { store, overpass, budget },
    )
    expect(overpass).not.toHaveBeenCalled()
    expect(result.groups[0]).toMatchObject({ status: 'unchecked', failure: { reason: 'outside' } })
  })
})

// assistant-geo, Requirement: Дальние категории в загруженной области
describe('the far places', () => {
  const box = { at: hotel, radiusM: 15_000, categories: ['airport', 'beach'] as PlaceCategory[] }
  const airport = row(20, ['airport'], near(39.4893, -0.4816), 'Aeropuerto de Valencia')

  // Scenario: Аэропорт в 20 км
  it('count as checked when the point is in an area loaded for them', async () => {
    const { store } = memoryStore([airport], [box])
    const overpass = vi.fn()
    const result = await nearbyPlaces(
      hotel,
      ['airport', 'beach'],
      { radiusM: 20_000, perCategory: 1 },
      { store, overpass, budget },
    )
    expect(overpass).not.toHaveBeenCalled()
    expect(result.groups[0]).toMatchObject({ status: 'found', places: [{ osmId: 20 }] })
    expect(result.groups[0].failure).toBeUndefined()
    expect(result.groups[1]).toMatchObject({ status: 'none' })
    expect(result.groups[1].failure).toBeUndefined()
  })

  it('are found without a failure when the cache has them beyond the loaded area', async () => {
    const { store } = memoryStore([airport], [{ ...box, categories: ['beach'] }])
    const result = await nearbyPlaces(
      hotel,
      ['airport'],
      { radiusM: 20_000, perCategory: 1 },
      { store, overpass: vi.fn(), budget },
    )
    expect(result.groups[0]).toMatchObject({ status: 'found', places: [{ osmId: 20 }] })
    expect(result.groups[0].failure).toBeUndefined()
  })

  it('ask the area only for a radius beyond the online one', async () => {
    const { store } = memoryStore([], [box])
    const overpass = vi.fn(async () => ok([]))
    await nearbyPlaces(hotel, ['bar'], { radiusM: 20_000, perCategory: 1 }, { store, overpass, budget })
    expect(store.near).toHaveBeenCalledTimes(1)
  })
})

describe('the geocoding', () => {
  const market: GeocodedPlace = {
    osmType: 'way',
    osmId: 5007139,
    name: 'Центральный рынок Валенсии',
    displayName: 'Центральный рынок Валенсии, Валенсия',
    lat: 39.4734917,
    lon: -0.3789053,
    categories: ['other'],
    tags: { amenity: 'marketplace' },
  }

  it('answers a name the cache has without Nominatim', async () => {
    const { store } = memoryStore()
    store.named.mockResolvedValue(ok([market]))
    const search = vi.fn()
    expect(await geocode('Центральный рынок Валенсии', { store, search, budget })).toMatchObject({
      ok: true,
      value: { source: 'cache', places: [{ osmId: 5007139 }] },
    })
    expect(search).not.toHaveBeenCalled()
  })

  it('writes what Nominatim finds for good', async () => {
    const { store, saved } = memoryStore()
    const search = vi.fn(async () => ok([market]))
    const result = await geocode('Mercado Central', { store, search, budget })
    expect(result).toMatchObject({ ok: true, value: { source: 'online' } })
    expect(saved).toEqual([
      {
        osm_type: 'way',
        osm_id: 5007139,
        name: 'Центральный рынок Валенсии',
        categories: ['other'],
        tags: { amenity: 'marketplace' },
        lat: 39.4734917,
        lon: -0.3789053,
        geom: 'SRID=4326;POINT(-0.3789053 39.4734917)',
      },
    ])
  })

  it('passes on what Nominatim could not find', async () => {
    const { store } = memoryStore()
    const result = await geocode('Atlantis', { store, search: async () => notFound('нет'), budget })
    expect(result).toEqual({ ok: false, reason: 'not-found', message: 'нет' })
    expect(store.save).not.toHaveBeenCalled()
  })
})
