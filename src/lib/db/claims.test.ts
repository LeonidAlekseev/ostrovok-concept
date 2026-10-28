import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NOISE_MENTION } from '../claimRows'
import { claimsOf, likePrefix, loadHotelClaims, searchHotelReviews } from './claims'

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

// hotel-knowledge, Requirement: Гибридный поиск по отзывам
describe('searchHotelReviews', () => {
  const row = (
    chunk_id: string,
    kind: string,
    text: string,
    fts_place: number | null,
    vector_place: number | null,
  ) => ({
    chunk_id,
    document_id: 'd1',
    evidence_id: 'e2',
    kind,
    ord: 0,
    text,
    metadata: {},
    rank: 0.03,
    fts_place,
    vector_place,
  })

  it('asks the hybrid search with the vector and keeps the reviews that name the topic', async () => {
    db.answers.hotel_chunks_hybrid = {
      data: [
        row('c1', 'review', 'Хорошо, но шумно', null, 1),
        row('c2', 'review', 'Прекрасно!!!!', null, 2),
        row('c3', 'hotelier_answer', 'Со слов отельера, номера Premium: шум в номере — ночью тихо.', 1, 3),
        row('c4', 'review', 'По ночам слышно улицу.', 2, null),
      ],
      error: null,
    }
    const found = await searchHotelReviews('ota-1', ' шум or шумно ', NOISE_MENTION, [0.6, 0.8])
    expect(found?.map((c) => [c.chunkId, c.ftsPlace, c.vectorPlace])).toEqual([
      ['c1', null, 1],
      ['c4', 2, null],
    ])
    expect(db.calls).toContainEqual([
      'rpc',
      'hotel_chunks_hybrid',
      { hotel_id: 'ota-1', query: 'шум or шумно', query_embedding: '[0.6,0.8]', max_rows: 50 },
    ])
  })

  it('searches by the words alone without a vector, null for a synthetic hotel or a failure', async () => {
    db.answers.hotel_chunks_hybrid = { data: [row('c4', 'review', 'По ночам слышно улицу.', 1, null)], error: null }
    expect(await searchHotelReviews('ota-1', 'шумно', NOISE_MENTION, null, 5)).toHaveLength(1)
    expect(db.calls).toContainEqual(['rpc', 'hotel_chunks_hybrid', { hotel_id: 'ota-1', query: 'шумно', max_rows: 5 }])
    expect(await searchHotelReviews('h-1', 'шумно', NOISE_MENTION, null)).toBeNull()
    delete db.answers.hotel_chunks_hybrid
    expect(await searchHotelReviews('ota-1', 'шумно', NOISE_MENTION, null)).toBeNull()
  })
})
