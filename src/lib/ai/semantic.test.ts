import { embed, rerank } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSecret } from '../secrets'
import { semanticSearch, similarHotels } from './semantic'

const rpc = vi.fn()

vi.mock('../secrets', () => ({ getSecret: vi.fn() }))
vi.mock('@/lib/supabase/config', () => ({
  isSupabaseConfigured: true,
  supabaseUrl: 'https://db.test',
  supabaseAnonKey: 'anon',
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: (...args: unknown[]) => ({ abortSignal: () => rpc(...args) }) }),
}))
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  embed: vi.fn(),
  rerank: vi.fn(),
}))

const matches = [
  { ref_id: 'prague-central-hostel', destination_id: 'prague', content: 'Хостел', similarity: 0.7 },
  { ref_id: 'prague-skyline-hostel', destination_id: 'prague', content: 'Хостел у реки', similarity: 0.6 },
  { ref_id: 'prague-grand-lodge', destination_id: 'prague', content: 'Отель', similarity: 0.5 },
]

let query = 0
/** Each test asks its own words, so the vectors' cache stays out of the way. */
const words = () => `тихий хостел ${++query}`

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(getSecret).mockResolvedValue('test-key')
  vi.mocked(embed).mockResolvedValue({ embedding: [0.1, 0.2] } as Awaited<ReturnType<typeof embed>>)
  rpc.mockResolvedValue({ data: matches, error: null })
})

const reranked = (ranking: { originalIndex: number; score: number }[]) =>
  ({ ranking }) as unknown as Awaited<ReturnType<typeof rerank>>

describe('semanticSearch', () => {
  it('finds the nearest vectors in the cities and returns the reranker’s order', async () => {
    vi.mocked(rerank).mockResolvedValue(
      reranked([
        { originalIndex: 1, score: 0.9 },
        { originalIndex: 0, score: 0.3 },
      ]),
    )
    const text = words()
    const hits = await semanticSearch(text, { kind: 'hotel', destinationIds: ['prague'], k: 2 })
    expect(hits).toEqual([
      { id: 'prague-skyline-hostel', destinationId: 'prague', score: 0.9 },
      { id: 'prague-central-hostel', destinationId: 'prague', score: 0.3 },
    ])
    expect(rpc).toHaveBeenCalledWith('match_embeddings', {
      query_embedding: '[0.1,0.2]',
      match_kind: 'hotel',
      destination_ids: ['prague'],
      match_count: 30,
    })
    expect(vi.mocked(rerank).mock.calls[0][0]).toMatchObject({ query: text, topN: 2 })
  })

  it('asks the model once for the hotels and the route of the same words, and again after a failure', async () => {
    vi.mocked(rerank).mockResolvedValue(reranked([{ originalIndex: 0, score: 0.9 }]))
    const text = words()
    await Promise.all([semanticSearch(text, { kind: 'hotel' }), semanticSearch(text, { kind: 'route', k: 1 })])
    expect(embed).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls.map(([, args]) => args.match_kind)).toEqual(['hotel', 'route'])

    const failing = words()
    vi.mocked(embed).mockRejectedValueOnce(new Error('timeout'))
    expect(await semanticSearch(failing, { kind: 'hotel' })).toBeNull()
    expect(await semanticSearch(failing, { kind: 'hotel' })).not.toBeNull()
    expect(embed).toHaveBeenCalledTimes(3)
  })

  it('keeps the vectors’ order when the reranker fails', async () => {
    vi.mocked(rerank).mockRejectedValue(new Error('429'))
    const hits = await semanticSearch(words(), { kind: 'hotel', k: 2 })
    expect(hits?.map((h) => [h.id, h.score])).toEqual([
      ['prague-central-hostel', 0.7],
      ['prague-skyline-hostel', 0.6],
    ])
  })

  it('gives null without the key, on a model error, without vectors or without text', async () => {
    vi.mocked(getSecret).mockResolvedValueOnce(undefined)
    expect(await semanticSearch(words(), { kind: 'hotel' })).toBeNull()
    vi.mocked(embed).mockRejectedValueOnce(new Error('timeout'))
    expect(await semanticSearch(words(), { kind: 'hotel' })).toBeNull()
    rpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await semanticSearch(words(), { kind: 'hotel' })).toBeNull()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'no function' } })
    expect(await semanticSearch(words(), { kind: 'hotel' })).toBeNull()
    expect(await semanticSearch('   ', { kind: 'hotel' })).toBeNull()
    expect(await semanticSearch(words(), { kind: 'hotel', destinationIds: [] })).toBeNull()
    expect(rerank).not.toHaveBeenCalled()
  })

  it('embeds the same words once', async () => {
    vi.mocked(rerank).mockResolvedValue(reranked([{ originalIndex: 0, score: 1 }]))
    const text = words()
    await semanticSearch(text, { kind: 'hotel' })
    await semanticSearch(text, { kind: 'hotel' })
    expect(embed).toHaveBeenCalledTimes(1)
  })
})

describe('similarHotels', () => {
  it('asks the database for the city’s hotels by likeness and the profile', async () => {
    rpc.mockResolvedValue({ data: [{ ref_id: 'prague-park-rooms', score: 0.8 }], error: null })
    expect(await similarHotels('prague-grand-lodge', ['a', 'a', 'b'], 5)).toEqual([
      { id: 'prague-park-rooms', score: 0.8 },
    ])
    expect(rpc).toHaveBeenCalledWith('similar_hotels', {
      hotel_id: 'prague-grand-lodge',
      profile_ids: ['a', 'b'],
      match_count: 5,
    })
  })

  it('gives null when the hotel has no vector or the database fails', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await similarHotels('nope')).toBeNull()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'down' } })
    expect(await similarHotels('nope')).toBeNull()
  })
})
