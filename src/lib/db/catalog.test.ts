import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getHotel } from '@/lib/catalogGenerator'
import { CatalogUnavailableError, loadHotel, loadHotels, loadNewHotels } from './catalog'

/** A Supabase query builder that records its calls and answers with `db.result`. */
const db = vi.hoisted(() => ({
  configured: true,
  calls: [] as unknown[][],
  result: { data: [] as unknown[] | null, error: null as { message: string } | null },
}))

vi.mock('@/lib/supabase/config', () => ({
  get isSupabaseConfigured() {
    return db.configured
  },
  supabaseUrl: 'https://project.supabase.test',
  supabaseAnonKey: 'anon',
}))
vi.mock('@supabase/supabase-js', () => {
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(db.result).then(resolve, reject),
  }
  for (const method of ['from', 'select', 'eq', 'in', 'order', 'returns'])
    builder[method] = (...args: unknown[]) => {
      db.calls.push([method, ...args])
      return builder
    }
  return { createClient: () => builder }
})
// Next's cache needs the server; the reads themselves are what is tested here.
vi.mock('next/cache', () => ({ unstable_cache: (read: unknown) => read }))

const lantern = getHotel('prague-old-town-lantern')!
const vltava = getHotel('prague-vltava-loft-rooms')!

beforeEach(() => {
  db.configured = true
  db.calls = []
  db.result = { data: [], error: null }
})

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
