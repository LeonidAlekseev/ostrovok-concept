import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadNoiseMap, noiseMapOf, placesOf } from './noise'

/** The answers of the database's functions by name, and the names asked. */
const db = vi.hoisted(() => ({
  answers: {} as Record<string, { data: unknown; error: { message: string; code?: string } | null }>,
  asked: [] as string[],
}))
vi.mock('@/lib/supabase/config', () => ({
  isSupabaseConfigured: true,
  supabaseUrl: 'https://project.supabase.test',
  supabaseAnonKey: 'anon',
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async (name: string) => {
      db.asked.push(name)
      return db.answers[name] ?? { data: null, error: { message: `no ${name}` } }
    },
  }),
}))
vi.mock('next/cache', () => ({ unstable_cache: (read: unknown) => read }))

beforeEach(() => {
  db.answers = {}
  db.asked = []
})

// hotel-page, Requirement: Шум и окружение настоящего отеля
describe('noiseMapOf', () => {
  const geometry = { type: 'Polygon', coordinates: [] }
  const band = (source: string, indicator: string, db_min: number | null, db_max: number | null) => ({
    type: 'Feature',
    geometry,
    properties: { layer: 'noise', source, indicator, db_min, db_max },
  })
  const piece = (lden: [number, number | null], lnight: [number | null, number | null]) => ({
    type: 'Feature',
    geometry,
    properties: {
      layer: 'noise',
      source: 'roadsInAgglomeration',
      lden_min: lden[0],
      lden_max: lden[1],
      lnight_min: lnight[0],
      lnight_max: lnight[1],
    },
  })

  it('keeps the Lnight contours with rounded coordinates and drops Lden and the buildings', () => {
    const map = noiseMapOf([
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-0.3763214, 39.4699187],
              [-0.37, 39.47],
              [-0.371, 39.471],
            ],
          ],
        },
        properties: { layer: 'noise', source: 'roadsInAgglomeration', indicator: 'Lnight', db_min: 55, db_max: 59 },
      },
      band('roadsInAgglomeration', 'Lden', 60, 64),
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [] },
        properties: { layer: 'building', id: 'b1', height: 12 },
      },
    ])
    expect(map.features).toEqual([
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-0.37632, 39.46992],
              [-0.37, 39.47],
              [-0.371, 39.471],
            ],
          ],
        },
        properties: { source: 'roadsInAgglomeration', indicator: 'Lnight', db_min: 55, db_max: 59, level: 55 },
      },
    ])
  })

  it('drops the bands below 40 dB of the layers and adds the quiet, Lden’s as the day’s', () => {
    const map = noiseMapOf(
      [band('industryInAgglomeration', 'Lnight', null, 39), band('roadsInAgglomeration', 'Lnight', 55, 59)],
      [
        band('quiet', 'Lden', null, 39),
        band('quiet', 'Lnight', null, 39),
        band('roadsInAgglomeration', 'Lnight', null, 39),
      ],
    )
    expect(map.features.map((f) => [f.properties.source, f.properties.indicator, f.properties.level])).toEqual([
      ['roadsInAgglomeration', 'Lnight', 55],
      ['quiet', 'Lday', null],
      ['quiet', 'Lnight', null],
    ])
  })

  it('gives each piece of hotel_noise_day the day estimate of its two bands', () => {
    const map = noiseMapOf(
      [],
      [],
      [piece([65, 69], [55, 59]), piece([40, 44], [null, 39]), piece([75, null], [65, 69]), piece([55, 59], [55, 59])],
    )
    expect(map.features.map((f) => f.properties)).toEqual([
      { source: 'roadsInAgglomeration', indicator: 'Lday', db_min: 59, db_max: 69, level: 64 },
      { source: 'roadsInAgglomeration', indicator: 'Lday', db_min: 34, db_max: 45, level: 39.2 },
      { source: 'roadsInAgglomeration', indicator: 'Lday', db_min: 69, db_max: null, level: 68.6 },
      // A night of 55 dB alone is louder than an Lden below 60: no day fits.
      { source: 'roadsInAgglomeration', indicator: 'Lday', db_min: null, db_max: null, level: null },
    ])
  })
})

describe('placesOf', () => {
  const place = (category: string, osm_id: number, distance_m: number, name: string | null = null) => ({
    category,
    osm_type: 'node',
    osm_id,
    name,
    lat: 39.47,
    lon: -0.376,
    distance_m,
  })

  it('lists the loud places nearest first, each once under the first of its categories (a bar that serves food is a bar)', () => {
    expect(
      placesOf({
        covered: ['bar', 'restaurant', 'pharmacy'],
        places: [
          place('restaurant', 2, 120, 'Sereno'),
          place('bar', 1, 92, 'Homenaje'),
          place('bar', 2, 120, 'Sereno'),
        ],
      }),
    ).toEqual({
      places: [
        { category: 'bar', name: 'Homenaje', distanceM: 92, lat: 39.47, lon: -0.376 },
        { category: 'bar', name: 'Sereno', distanceM: 120, lat: 39.47, lon: -0.376 },
      ],
      placesCovered: ['bar', 'restaurant'],
    })
  })

  it('has nothing for an answer it cannot read', () => {
    expect(placesOf(null)).toEqual({ places: [], placesCovered: [] })
  })
})

// geo-data, Requirement: Готовые карты шума отелей
describe('loadNoiseMap', () => {
  const hotel = { id: 'ota-1', lat: 39.47, lon: -0.37 }
  const night = {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [] },
    properties: { layer: 'noise', source: 'roadsInAgglomeration', indicator: 'Lnight', db_min: 55, db_max: 59 },
  }
  const quiet = {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [] },
    properties: { layer: 'noise', source: 'quiet', indicator: 'Lnight', db_min: null, db_max: 39 },
  }

  it('reads the map computed ahead in one call', async () => {
    db.answers.hotel_noise_map = { data: { contours: [night], quiet: [quiet], day: [] }, error: null }
    const map = await loadNoiseMap(hotel)
    expect(db.asked).toEqual(['hotel_noise_map'])
    expect(map).toEqual(noiseMapOf([night], [quiet], []))
  })

  it('computes the map when the point has none yet (Scenario: Новый отель до пересчёта)', async () => {
    db.answers.hotel_noise_map = { data: null, error: null }
    db.answers.hotel_geo_features = { data: { features: [night] }, error: null }
    db.answers.hotel_noise_quiet = { data: { features: [quiet] }, error: null }
    db.answers.hotel_noise_day = { data: { features: [] }, error: null }
    const map = await loadNoiseMap(hotel)
    expect(db.asked).toEqual(['hotel_noise_map', 'hotel_geo_features', 'hotel_noise_quiet', 'hotel_noise_day'])
    expect(map).toEqual(noiseMapOf([night], [quiet], []))
  })

  it('reads no map for a synthetic hotel without asking', async () => {
    expect(await loadNoiseMap({ ...hotel, id: 'prague-old-town-lantern' })).toBeNull()
    expect(db.asked).toEqual([])
  })
})

describe('loadHotelNoise', () => {
  it('asks the facade once more when the first call is cancelled by the statement timeout', async () => {
    const answers = [
      { data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } },
      { data: { zone: { kind: 'circle', radius_m: 25 }, bands: [] }, error: null },
    ]
    const rpc = vi.fn(async (_name: string) => answers.shift())
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc }) }))
    vi.resetModules()
    const { loadHotelNoise: load } = await import('./noise')
    await load({ id: 'ota-1', lat: 39.4, lon: -0.3 })
    expect(rpc.mock.calls.filter(([name]) => name === 'hotel_noise_facade')).toHaveLength(2)
    vi.doUnmock('@supabase/supabase-js')
  })
})
