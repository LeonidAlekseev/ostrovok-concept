import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chunksOf, claimsOf, likePrefix, loadHotelClaims, searchHotelChunks } from './claims'

/** The answers of the database by table or function, and what was asked. */
const db = vi.hoisted(() => ({
  answers: {} as Record<string, { data: unknown; error: { message: string } | null }>,
  calls: [] as [string, ...unknown[]][],
}))
vi.mock('@/lib/supabase/config', () => ({
  isSupabaseConfigured: true,
  supabaseUrl: 'https://project.supabase.test',
  supabaseAnonKey: 'anon',
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      // A query of any chain of calls, recorded, answering the table's answer when awaited.
      const answer = db.answers[table] ?? { data: null, error: { message: `no ${table}` } }
      const query: object = new Proxy(
        {},
        {
          get: (_target, name: string) =>
            name === 'then'
              ? (resolve: (value: unknown) => unknown) => resolve(answer)
              : (...args: unknown[]) => {
                  db.calls.push([name, ...args])
                  return query
                },
        },
      )
      return query
    },
    rpc: async (name: string, args: unknown) => {
      db.calls.push(['rpc', name, args])
      return db.answers[name] ?? { data: null, error: { message: `no ${name}` } }
    },
  }),
}))
vi.mock('next/cache', () => ({ unstable_cache: (read: unknown) => read }))

beforeEach(() => {
  db.answers = {}
  db.calls = []
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

const evidence = {
  id: 'e1',
  type: 'dataset',
  title: 'EEA noise contours v01_r00',
  provider: 'EEA',
  external_id: 'eea-noise-end2022-v01_r00',
  url: 'https://sdi.eea.europa.eu/x',
  retrieved_at: '2026-10-26T18:06:03.471+00:00',
  excerpt: null,
  dataset_id: 'eea-noise-end2022-v01_r00',
}
const claim = (values: object, extra: object = {}) => ({
  id: 'c1',
  property: 'noise.lnight.roadsInAgglomeration',
  source_key: '',
  value_numeric: null,
  value_min: null,
  value_max: null,
  value_text: null,
  value_boolean: null,
  value_json: null,
  unit: 'dB',
  epistemic_status: 'reported',
  confidence: null,
  method: { layer: 'roadsInAgglomeration' },
  observed_at: null,
  valid_from: null,
  valid_to: null,
  limitations: ['Полоса 5 дБ, а не уровень'],
  calculation: null,
  claim_evidence: [{ role: 'source', evidence }],
  entity: { kind: 'hotel', ref: 'ota-1' },
  ...values,
  ...extra,
})

// hotel-knowledge, Requirement: Чтение утверждений отеля
describe('claimsOf', () => {
  it('reads the value of each kind with its evidence and calculation', () => {
    const calculation = {
      id: 'k1',
      method: '2002/49/EC',
      version: 'dayEstimate-1',
      inputs: { lden: { min: 70, max: 74 } },
      parameters: { evening_equals_day: true },
      limitations: ['Допущение: вечер так же громок, как день'],
      computed_at: '2026-10-27T15:27:59.938+00:00',
    }
    const [range, derived, text] = claimsOf([
      claim({ value_min: 60, value_max: 64 }),
      claim({ value_min: 63.4, value_max: 68.1 }, { epistemic_status: 'derived', calculation }),
      claim({ value_text: 'По ночам слышно улицу.' }, { unit: null }),
    ])
    expect(range).toMatchObject({
      property: 'noise.lnight.roadsInAgglomeration',
      value: { kind: 'range', min: 60, max: 64 },
      status: 'reported',
      confidence: null,
      calculation: null,
      evidence: [{ id: 'e1', role: 'source', provider: 'EEA', datasetId: 'eea-noise-end2022-v01_r00' }],
    })
    expect(derived.calculation).toMatchObject({ version: 'dayEstimate-1', computedAt: calculation.computed_at })
    expect(text.value).toEqual({ kind: 'text', value: 'По ночам слышно улицу.' })
    expect(claimsOf([claim({ value_numeric: 3 })])[0].value).toEqual({ kind: 'number', value: 3 })
    expect(claimsOf([claim({ value_boolean: false })])[0].value).toEqual({ kind: 'boolean', value: false })
  })

  it('leaves out a row with no value, two values or an unknown status', () => {
    expect(
      claimsOf([
        claim({}),
        claim({ value_numeric: 1, value_text: 'x' }),
        claim({ value_numeric: 1 }, { epistemic_status: 'guessed' }),
        claim({ value_numeric: 1 }, { confidence: 2 }),
        null,
      ]),
    ).toEqual([])
  })
})

describe('loadHotelClaims', () => {
  it('asks for the hotel by its entity and the property by its prefix, `_` as itself', async () => {
    db.answers.claims = { data: [claim({ value_min: 60, value_max: 64 })], error: null }
    const claims = await loadHotelClaims('ota-1', 'noise.lnight_x')
    expect(claims).toHaveLength(1)
    expect(db.calls).toContainEqual(['eq', 'entity.ref', 'ota-1'])
    expect(db.calls).toContainEqual(['like', 'property', 'noise.lnight\\_x%'])
    expect(likePrefix('a%b')).toBe('a\\%b%')
  })

  it('is null for a synthetic hotel, a bad prefix or a failure, and [] when there are none', async () => {
    expect(await loadHotelClaims('h-1', 'noise.')).toBeNull()
    expect(await loadHotelClaims('ota-1', "noise.' or")).toBeNull()
    expect(await loadHotelClaims('ota-1', 'noise.')).toBeNull()
    db.answers.claims = { data: [], error: null }
    expect(await loadHotelClaims('ota-1', 'noise.')).toEqual([])
  })
})

// hotel-knowledge, Requirement: Полнотекстовый поиск по отзывам
describe('searchHotelChunks', () => {
  const chunk = {
    chunk_id: 'ch1',
    document_id: 'd1',
    evidence_id: 'e2',
    kind: 'review',
    ord: 2,
    text: 'По ночам слышно улицу.',
    metadata: { part: 'minus' },
    rank: 0.06,
  }

  it('asks the function for the hotel and reads the chunks', async () => {
    db.answers.hotel_chunks_search = { data: [chunk, { chunk_id: 1 }], error: null }
    expect(await searchHotelChunks('ota-1', '  шумно  ', 500)).toEqual([
      {
        chunkId: 'ch1',
        documentId: 'd1',
        evidenceId: 'e2',
        kind: 'review',
        ord: 2,
        text: 'По ночам слышно улицу.',
        metadata: { part: 'minus' },
        rank: 0.06,
      },
    ])
    expect(db.calls).toContainEqual(['rpc', 'hotel_chunks_search', { hotel_id: 'ota-1', query: 'шумно', max_rows: 50 }])
  })

  it('is [] for an empty query and null for a synthetic hotel or a failure', async () => {
    expect(await searchHotelChunks('ota-1', '   ')).toEqual([])
    expect(await searchHotelChunks('h-1', 'шумно')).toBeNull()
    expect(await searchHotelChunks('ota-1', 'шумно')).toBeNull()
    expect(chunksOf([null])).toEqual([])
  })
})
