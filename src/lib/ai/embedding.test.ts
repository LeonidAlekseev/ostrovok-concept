import { APICallError, embedMany } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, EMBEDDING_URL, embeddingModel, truncate } from './embedding'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(status: number, body: unknown) {
  const fetch = vi.fn(
    async (..._args: Parameters<typeof globalThis.fetch>) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}

/** A model's vector: 4096 numbers, the first 2048 of them `head`, the rest `tail`. */
const vector = (head: number, tail: number) =>
  Array.from({ length: 4096 }, (_, i) => (i < EMBEDDING_DIMENSIONS ? head : tail))

describe('truncate', () => {
  it('keeps the first numbers and scales them back to length 1', () => {
    expect(truncate([3, 4, 12], 2)).toEqual([0.6, 0.8])
    expect(truncate([0, 0, 1], 2)).toEqual([0, 0])
  })
})

describe('embeddingModel', () => {
  it('sends the input type to NVIDIA and gives 2048 numbers of length 1, in the order of the texts', async () => {
    const fetch = stubFetch(200, {
      data: [
        { index: 1, embedding: vector(2, 9) },
        { index: 0, embedding: vector(1, 9) },
      ],
      usage: { prompt_tokens: 12 },
    })
    const { embeddings, usage } = await embedMany({
      model: embeddingModel('test-key', 'passage'),
      values: ['вилла', 'хостел'],
      maxRetries: 0,
    })
    expect(embeddings).toHaveLength(2)
    for (const embedding of embeddings) {
      expect(embedding).toHaveLength(EMBEDDING_DIMENSIONS)
      expect(Math.hypot(...embedding)).toBeCloseTo(1)
    }
    expect(usage.tokens).toBe(12)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(EMBEDDING_URL)
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-key')
    expect(JSON.parse(String(init?.body))).toEqual({
      model: EMBEDDING_MODEL,
      input: ['вилла', 'хостел'],
      input_type: 'passage',
      encoding_format: 'float',
      truncate: 'END',
    })
  })

  it('throws a retryable API error on a rate limit and a final one on a bad request', async () => {
    const model = embeddingModel('k', 'query')
    stubFetch(429, { status: 429, title: 'Too Many Requests' })
    const limited = await Promise.resolve(model.doEmbed({ values: ['q'] })).catch((e: unknown) => e)
    expect(APICallError.isInstance(limited) && limited.statusCode === 429 && limited.isRetryable).toBe(true)
    stubFetch(400, { detail: 'bad input' })
    const bad = await Promise.resolve(model.doEmbed({ values: ['q'] })).catch((e: unknown) => e)
    expect(APICallError.isInstance(bad) && bad.isRetryable).toBe(false)
  })
})
