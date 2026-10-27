import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHotel } from '@/lib/catalogGenerator'
import { setProduction } from '@/test/env'
import {
  CatalogUnavailableError,
  loadCityHotels,
  loadDestinations,
  loadHotel,
  loadHotels,
  loadHotelSummaries,
  loadNewHotels,
} from './catalog'

type Result = { data: unknown[] | null; error: { message: string } | null }

/** A Supabase query builder that records its calls and answers with the table's `db.tables` or `db.result`. */
const db = vi.hoisted(() => ({
  configured: true,
  calls: [] as unknown[][],
  result: { data: [], error: null } as Result,
  tables: {} as Record<string, Result>,
}))

vi.mock('@/lib/supabase/config', () => ({
  get isSupabaseConfigured() {
    return db.configured
  },
  supabaseUrl: 'https://project.supabase.test',
  supabaseAnonKey: 'anon',
}))
vi.mock('@supabase/supabase-js', () => {
  // One builder per query: a loader may read several tables at once.
  const query = (table: string) => {
    const builder: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(db.tables[table] ?? db.result).then(resolve, reject),
    }
    for (const method of ['select', 'eq', 'in', 'order', 'overrideTypes'])
      builder[method] = (...args: unknown[]) => {
        db.calls.push([method, ...args])
        return builder
      }
    return builder
  }
  const from = (table: string) => {
    db.calls.push(['from', table])
    return query(table)
  }
  // A function answers with its `db.tables['rpc:<name>']`, none by default.
  const rpc = (name: string) => {
    db.calls.push(['rpc', name])
    db.tables[`rpc:${name}`] ??= { data: [], error: null }
    return query(`rpc:${name}`)
  }
  return { createClient: () => ({ from, rpc }) }
})
vi.mock('@/lib/env', () => import('@/test/env'))
// Next's cache needs the server; the reads themselves are what is tested here.
vi.mock('next/cache', () => ({ unstable_cache: (read: unknown) => read }))

const lantern = getHotel('prague-old-town-lantern')!
const vltava = getHotel('prague-vltava-loft-rooms')!

beforeEach(() => {
  db.configured = true
  db.calls = []
  db.result = { data: [], error: null }
  db.tables = {}
})
afterEach(() => setProduction(false))

// hotel-catalog, Requirement: Чтение каталога из Supabase
describe('the catalogue from Supabase', () => {
  it('reads one hotel by id from the hotels table (Scenario: Страница отеля из базы)', async () => {
    db.result.data = [{ data: lantern }]
    expect(await loadHotel(lantern.id)).toEqual(lantern)
    expect(db.calls).toContainEqual(['from', 'hotels'])
    expect(db.calls).toContainEqual(['eq', 'id', lantern.id])
  })

  it('answers undefined for an unknown hotel (Scenario: Неизвестный отель)', async () => {
    expect(await loadHotel('nowhere-hotel')).toBeUndefined()
  })

  it('returns the hotels in the order of the ids, once a set, skipping unknown ones', async () => {
    db.result.data = [{ data: lantern }, { data: vltava }]
    const found = await loadHotels([vltava.id, 'gone', lantern.id, vltava.id])
    expect(found.map((h) => h.id)).toEqual([vltava.id, lantern.id, vltava.id])
    expect(db.calls).toContainEqual(['in', 'id', ['gone', lantern.id, vltava.id].sort()])
  })

  it('asks nothing for no ids', async () => {
    expect(await loadHotels([])).toEqual([])
    expect(db.calls).toEqual([])
  })

  it('keeps the summaries of the new hotels in the catalogue order', async () => {
    db.result.data = [
      { id: 'a', isNew: true },
      { id: 'b', isNew: false },
      { id: 'c', isNew: true },
    ]
    expect((await loadNewHotels()).map((h) => h.id)).toEqual(['a', 'c'])
    expect(db.calls).toContainEqual(['order', 'position', { nullsFirst: false }])
  })

  it('gives each new hotel its first photo, read alone, or null', async () => {
    const photo = { id: 'photo-1', caption: 'Фасад', tone: 0, url: 'https://cdn.ostrovok.ru/t/{size}/a.jpeg' }
    db.result.data = [
      { id: 'a', isNew: true, photo },
      { id: 'c', isNew: true, photo: null },
    ]
    expect((await loadNewHotels()).map((h) => [h.id, h.photo])).toEqual([
      ['a', photo],
      ['c', null],
    ])
    expect(db.calls).toContainEqual(['select', 'id, photo:data->photos->0'])
    expect(db.calls).toContainEqual(['in', 'id', ['a', 'c']])
  })

  it('turns a database error into CatalogUnavailableError', async () => {
    db.result = { data: null, error: { message: 'connection refused' } }
    await expect(loadHotel(lantern.id)).rejects.toThrow(CatalogUnavailableError)
    await expect(loadHotel(lantern.id)).rejects.toThrow('Каталог недоступен: connection refused')
  })

  it('names the missing settings instead of querying without them', async () => {
    db.configured = false
    await expect(loadHotel(lantern.id)).rejects.toThrow('npm run secrets:reveal')
    expect(db.calls).toEqual([])
  })
})

// hotel-catalog, Requirement: Синтетические отели только вне production
describe('the hotels shown', () => {
  const real = (n: number, isNew = false) => ({ id: `ota-${n}`, destinationId: 'valencia', isNew })
  const summaries = [
    { id: 'prague-a', destinationId: 'prague', isNew: true },
    { id: 'prague-b', destinationId: 'prague', isNew: false },
    real(1),
    real(2),
    real(3),
    real(4),
  ]
  beforeEach(() => {
    db.tables = {
      destinations: {
        data: [{ data: { id: 'prague' } }, { data: { id: 'valencia' } }, { data: { id: 'rome' } }],
        error: null,
      },
      hotels: { data: summaries, error: null },
    }
  })

  it('shows every hotel and every city with hotels outside production (Scenario: Preview)', async () => {
    expect((await loadHotelSummaries()).map((h) => h.id)).toEqual(summaries.map((h) => h.id))
    expect((await loadDestinations()).map((d) => d.id)).toEqual(['prague', 'valencia'])
  })

  it('shows only the real hotels and their cities in production (Scenario: Production)', async () => {
    setProduction(true)
    expect((await loadHotelSummaries()).map((h) => h.id)).toEqual(['ota-1', 'ota-2', 'ota-3', 'ota-4'])
    expect((await loadDestinations()).map((d) => d.id)).toEqual(['valencia'])
  })

  it('spotlights the first hotels of a city without hand-picked ones (Scenario: Глобус в production)', async () => {
    expect((await loadNewHotels()).map((h) => h.id)).toEqual(['prague-a', 'ota-1', 'ota-2', 'ota-3'])
    setProduction(true)
    expect((await loadNewHotels()).map((h) => h.id)).toEqual(['ota-1', 'ota-2', 'ota-3'])
  })

  it('does not read a synthetic hotel in production (Scenario: Синтетический отель в production)', async () => {
    setProduction(true)
    expect(await loadHotel(lantern.id)).toBeUndefined()
    expect(db.calls).toEqual([])
  })

  it('skips the synthetic hotels by id and in the cities in production (Scenario: API)', async () => {
    setProduction(true)
    const valencian = { ...lantern, id: 'ota-1', destinationId: 'valencia' }
    db.tables.hotels = { data: [{ data: valencian }], error: null }
    expect((await loadHotels([lantern.id, 'ota-1'])).map((h) => h.id)).toEqual(['ota-1'])
    expect(db.calls).toContainEqual(['in', 'id', ['ota-1']])

    db.tables.hotels = { data: [{ data: lantern }, { data: valencian }], error: null }
    expect((await loadCityHotels(['prague'])).map((h) => h.id)).toEqual(['ota-1'])
  })

  // hotel-catalog, Requirement: Отели вне карт шума скрыты
  it('hides the real hotels outside the noise maps everywhere (Scenario: Отель у аэропорта)', async () => {
    db.tables['rpc:hotels_outside_noise'] = { data: ['ota-2'], error: null }
    expect((await loadHotelSummaries()).map((h) => h.id)).not.toContain('ota-2')
    expect(await loadHotel('ota-2')).toBeUndefined()

    const valencian = (id: string) => ({ data: { ...lantern, id, destinationId: 'valencia' } })
    db.tables.hotels = { data: [valencian('ota-1')], error: null }
    expect((await loadHotels(['ota-1', 'ota-2'])).map((h) => h.id)).toEqual(['ota-1'])
    expect(db.calls).toContainEqual(['in', 'id', ['ota-1']])
    db.tables.hotels = { data: [valencian('ota-1'), valencian('ota-2')], error: null }
    expect((await loadCityHotels(['valencia'])).map((h) => h.id)).toEqual(['ota-1'])
  })

  // hotel-catalog, Requirement: Скрытие по данным шума (Scenario: Сбой чтения)
  it('hides none when the hotels outside the noise maps cannot be read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.tables['rpc:hotels_outside_noise'] = { data: null, error: { message: 'no function' } }
    expect((await loadHotelSummaries()).map((h) => h.id)).toEqual(summaries.map((h) => h.id))
  })
})
