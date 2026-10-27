import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadClaimsByIds, loadLevelIndex, loadNearIndex } from './knowledge'

/** The pages of the database by table, and what was asked. */
const db = vi.hoisted(() => ({
  pages: {} as Record<string, { data: unknown[] | null; error: { message: string } | null }[]>,
  calls: [] as [string, string, ...unknown[]][],
}))
vi.mock('@/lib/supabase/config', () => ({
  isSupabaseConfigured: true,
  supabaseUrl: 'https://project.supabase.test',
  supabaseAnonKey: 'anon',
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      // A query of any chain of calls, recorded; awaited, it answers the table's next page.
      const query: object = new Proxy(
        {},
        {
          get: (_target, name: string) =>
            name === 'then'
              ? (resolve: (value: unknown) => unknown) =>
                  resolve(db.pages[table]?.shift() ?? { data: null, error: { message: `no ${table}` } })
              : (...args: unknown[]) => {
                  db.calls.push([table, name, ...args])
                  return query
                },
        },
      )
      return query
    },
  }),
}))
vi.mock('next/cache', () => ({ unstable_cache: (read: unknown) => read }))

beforeEach(() => {
  db.pages = {}
  db.calls = []
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

const level = (i: number) => ({
  id: `c${i}`,
  property: 'noise.lnight.roadsInAgglomeration',
  value_min: 45,
  value_max: 49,
  value_numeric: null,
  entity: { kind: 'hotel', ref: `ota-${i}` },
})

describe('the indexes of the store', () => {
  it('reads the levels page by page until a short one', async () => {
    db.pages.claims = [
      { data: Array.from({ length: 1000 }, (_, i) => level(i)), error: null },
      { data: [level(1000), { broken: true }], error: null },
    ]
    const rows = await loadLevelIndex()
    expect(rows).toHaveLength(1001)
    expect(rows![0]).toEqual({
      hotelId: 'ota-0',
      property: 'noise.lnight.roadsInAgglomeration',
      min: 45,
      max: 49,
      value: null,
    })
    expect(db.calls.filter(([, name]) => name === 'range').map(([, , ...args]) => args)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('reads a failure as null', async () => {
    expect(await loadLevelIndex()).toBeNull()
  })

  it('reads the places of a category by the edges near: OSM by its categories, Островок by its kind, once each', async () => {
    const row = (id: string, ref: string, distance: number, kind: string, name: string | null) => ({
      id: `r-${id}`,
      claim: { id, property: 'nearby.distance', value_numeric: distance, method: {} },
      subject: { kind: 'hotel', ref },
      object: { kind, name },
    })
    db.pages.relations = [
      {
        data: [row('c1', 'ota-1', 300, 'osm_place', null), row('c2', 'ota-1', 665, 'ota_poi', 'Hospital')],
        error: null,
      },
      { data: [row('c2', 'ota-1', 665, 'ota_poi', 'Hospital')], error: null },
    ]
    const rows = await loadNearIndex('hospital')
    expect(rows).toEqual([
      { hotelId: 'ota-1', claimId: 'c1', distanceM: 300, name: null, kind: 'osm_place' },
      { hotelId: 'ota-1', claimId: 'c2', distanceM: 665, name: 'Hospital', kind: 'ota_poi' },
    ])
    const contains = db.calls.filter(([, name]) => name === 'contains').map(([, , ...args]) => args)
    expect(contains).toEqual([
      ['claim.method', { categories: ['hospital'] }],
      ['claim.method', { kind: 'Больница' }],
    ])
    expect(await loadNearIndex('drop table')).toBeNull()
  })

  it('reads the claims of the ids whole, only uuids', async () => {
    expect(await loadClaimsByIds(['nope'])).toEqual([])
    db.pages.claims = [{ data: [], error: null }]
    expect(await loadClaimsByIds(['11111111-1111-4111-8111-111111111111'])).toEqual([])
    expect(db.calls.find(([, name]) => name === 'in')).toEqual([
      'claims',
      'in',
      'id',
      ['11111111-1111-4111-8111-111111111111'],
    ])
  })
})
