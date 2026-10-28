import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadHotelRelations } from './knowledge'

const db = vi.hoisted(() => ({
  relations: { data: [] as unknown, error: null as { message: string } | null },
  calls: [] as unknown[][],
}))
vi.mock('@/lib/supabase/config', () => ({
  isSupabaseConfigured: true,
  supabaseUrl: 'https://project.supabase.test',
  supabaseAnonKey: 'anon',
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const query: object = new Proxy(
        {},
        {
          get: (_target, name: string) =>
            name === 'then'
              ? (resolve: (value: unknown) => unknown) => resolve(db.relations)
              : (...args: unknown[]) => {
                  db.calls.push([name, ...args])
                  return query
                },
        },
      )
      return query
    },
  }),
}))
vi.mock('next/cache', () => ({ unstable_cache: (read: unknown) => read }))

const distance = (value: number, ref: string) => ({
  id: `claim-${ref}`,
  property: 'nearby.distance',
  source_key: ref,
  value_numeric: value,
  value_min: null,
  value_max: null,
  value_text: null,
  value_boolean: null,
  value_json: null,
  unit: 'm',
  epistemic_status: 'derived',
  confidence: 1,
  method: {},
  observed_at: null,
  valid_from: null,
  valid_to: null,
  limitations: [],
  calculation: null,
  claim_evidence: [],
})
const points: Record<string, { lat: number; lon: number }> = { 'node/2': { lat: 39.383, lon: -0.333 } }
const edge = (ref: string, meters: number, categories: string[], kind = 'osm_place') => ({
  id: `edge-${ref}`,
  predicate: 'near',
  confidence: 1,
  object: { kind, ref, name: ref === 'node/2' ? 'Farmacia' : null, metadata: points[ref] ?? {} },
  claim: distance(meters, ref),
  evidence: {
    id: `ev-${ref}`,
    type: 'osm',
    title: ref,
    provider: 'OpenStreetMap',
    external_id: ref,
    url: `https://www.openstreetmap.org/${ref}`,
    retrieved_at: null,
    excerpt: null,
    dataset_id: null,
    metadata: { categories },
  },
})

const hotel = { id: 'ota-1', lat: 39.38, lon: -0.33 }

beforeEach(() => {
  db.calls = []
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

// hotel-knowledge, Requirement: Чтение связей отеля
describe('loadHotelRelations', () => {
  beforeEach(() => {
    db.relations = {
      data: [edge('node/1', 300, ['bar']), edge('node/2', 66.2, ['pharmacy']), { id: 'broken' }],
      error: null,
    }
  })

  it('reads the edges of the hotel nearest first, with the place, the distance claim and the source', async () => {
    const relations = await loadHotelRelations(hotel)
    expect(relations?.map((r) => r.object.ref)).toEqual(['node/2', 'node/1'])
    expect(relations![0]).toMatchObject({
      predicate: 'near',
      confidence: 1,
      object: { kind: 'osm_place', name: 'Farmacia', lat: 39.383, lon: -0.333, categories: ['pharmacy'] },
      claim: { value: { kind: 'number', value: 66.2 }, confidence: 1 },
      evidence: { provider: 'OpenStreetMap', externalId: 'node/2' },
    })
    expect(db.calls).toContainEqual(['eq', 'subject.ref', 'ota-1'])
    expect(db.calls.some((call) => call[0] === 'rpc')).toBe(false)
  })

  it('filters by the place category and by the predicate', async () => {
    expect((await loadHotelRelations(hotel, { category: 'pharmacy' }))?.map((r) => r.object.ref)).toEqual(['node/2'])
    expect(await loadHotelRelations(hotel, { category: 'bar', predicate: 'near' })).toHaveLength(1)
    expect(db.calls).toContainEqual(['eq', 'predicate', 'near'])
  })

  it('leaves a point null for a place stored without one, and for a building', async () => {
    db.relations = {
      data: [edge('node/9', 10, ['pharmacy']), edge('b-1', 3, [], 'building')],
      error: null,
    }
    const relations = await loadHotelRelations(hotel)
    expect(relations![0].object).toMatchObject({ ref: 'b-1', lat: null, lon: null, categories: [] })
    expect(relations![1].object).toMatchObject({ ref: 'node/9', lat: null, lon: null, categories: ['pharmacy'] })
  })

  it('is null for a synthetic hotel and a failure, and [] when there are none', async () => {
    expect(await loadHotelRelations({ ...hotel, id: 'h-1' })).toBeNull()
    db.relations = { data: [], error: null }
    expect(await loadHotelRelations(hotel)).toEqual([])
    db.relations = { data: null, error: { message: 'no relations' } }
    expect(await loadHotelRelations(hotel)).toBeNull()
  })
})
