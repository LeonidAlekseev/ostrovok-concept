import { embed, rerank } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSecret } from '../secrets'
import { semanticSearch } from './semantic'

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
    const hits = await semanticSearch(text, { destinationIds: ['prague'], k: 2 })
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

  it('asks the model once for concurrent searches of the same words, and again after a failure', async () => {
    vi.mocked(rerank).mockResolvedValue(reranked([{ originalIndex: 0, score: 0.9 }]))
    const text = words()
    await Promise.all([semanticSearch(text, {}), semanticSearch(text, { k: 1 })])
    expect(embed).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls.map(([, args]) => args.match_kind)).toEqual(['hotel', 'hotel'])

    const failing = words()
    vi.mocked(embed).mockRejectedValueOnce(new Error('timeout'))
    expect(await semanticSearch(failing, {})).toBeNull()
    expect(await semanticSearch(failing, {})).not.toBeNull()
    expect(embed).toHaveBeenCalledTimes(3)
  })

  it('keeps the shared vector when the first of two concurrent searches is cancelled', async () => {
    vi.mocked(rerank).mockResolvedValue(reranked([{ originalIndex: 0, score: 0.9 }]))
    let answer!: (result: Awaited<ReturnType<typeof embed>>) => void
    vi.mocked(embed).mockImplementationOnce(
      ({ abortSignal }) =>
        new Promise((resolve, reject) => {
          abortSignal?.addEventListener('abort', () => reject(abortSignal.reason))
          answer = resolve
        }),
    )
    const text = words()
    const first = new AbortController()
    const cancelled = semanticSearch(text, { signal: first.signal })
    const second = semanticSearch(text, {})
    await vi.waitFor(() => expect(embed).toHaveBeenCalledTimes(1))
    first.abort()
    expect(await cancelled).toBeNull()
    answer({ embedding: [0.1, 0.2] } as Awaited<ReturnType<typeof embed>>)
    expect(await second).toEqual([{ id: 'prague-central-hostel', destinationId: 'prague', score: 0.9 }])
    expect(embed).toHaveBeenCalledTimes(1)
  })

  it('does not keep a shared vector that failed for everyone waiting on it', async () => {
    const text = words()
    vi.mocked(embed).mockRejectedValueOnce(new Error('timeout'))
    expect(await Promise.all([semanticSearch(text, {}), semanticSearch(text, {})])).toEqual([null, null])
    vi.mocked(rerank).mockResolvedValue(reranked([{ originalIndex: 0, score: 0.9 }]))
    expect(await semanticSearch(text, {})).not.toBeNull()
    expect(embed).toHaveBeenCalledTimes(2)
  })

  it('keeps the vectors’ order when the reranker fails', async () => {
    vi.mocked(rerank).mockRejectedValue(new Error('429'))
    const hits = await semanticSearch(words(), { k: 2 })
    expect(hits?.map((h) => [h.id, h.score])).toEqual([
      ['prague-central-hostel', 0.7],
      ['prague-skyline-hostel', 0.6],
    ])
  })

  it('gives null without the key, on a model error, without vectors or without text', async () => {
    vi.mocked(getSecret).mockResolvedValueOnce(undefined)
    expect(await semanticSearch(words(), {})).toBeNull()
    vi.mocked(embed).mockRejectedValueOnce(new Error('timeout'))
    expect(await semanticSearch(words(), {})).toBeNull()
    rpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await semanticSearch(words(), {})).toBeNull()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'no function' } })
    expect(await semanticSearch(words(), {})).toBeNull()
    expect(await semanticSearch('   ', {})).toBeNull()
    expect(await semanticSearch(words(), { destinationIds: [] })).toBeNull()
    expect(rerank).not.toHaveBeenCalled()
  })

  it('embeds the same words once', async () => {
    vi.mocked(rerank).mockResolvedValue(reranked([{ originalIndex: 0, score: 1 }]))
    const text = words()
    await semanticSearch(text, {})
    await semanticSearch(text, {})
    expect(embed).toHaveBeenCalledTimes(1)
  })
})
