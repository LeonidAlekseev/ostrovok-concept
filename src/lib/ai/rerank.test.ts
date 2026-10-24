import { APICallError, rerank } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RERANK_MODEL, RERANK_URL, nvidiaReranker } from './rerank'

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

describe('nvidiaReranker', () => {
  it('sends the query and the passages to NVIDIA and keeps the top N by its logits', async () => {
    const fetch = stubFetch(200, {
      rankings: [
        { index: 2, logit: -1.6 },
        { index: 0, logit: -3.2 },
        { index: 1, logit: -3.4 },
      ],
    })
    const { rerankedDocuments, ranking } = await rerank({
      model: nvidiaReranker('test-key'),
      query: 'тихий хостел',
      documents: ['шумный клуб', 'вилла', 'тихий хостел'],
      topN: 2,
      maxRetries: 0,
    })
    expect(rerankedDocuments).toEqual(['тихий хостел', 'шумный клуб'])
    expect(ranking.map((r) => r.score)).toEqual([-1.6, -3.2])
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(RERANK_URL)
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-key')
    expect(JSON.parse(String(init?.body))).toEqual({
      model: RERANK_MODEL,
      query: { text: 'тихий хостел' },
      passages: [{ text: 'шумный клуб' }, { text: 'вилла' }, { text: 'тихий хостел' }],
      truncate: 'END',
    })
  })

  it('orders the rankings itself and drops an index outside the documents', async () => {
    stubFetch(200, {
      rankings: [
        { index: 5, logit: 1 },
        { index: 1, logit: -2 },
        { index: 0, logit: 0.5 },
      ],
    })
    const result = await nvidiaReranker('k').doRerank({ query: 'q', documents: { type: 'text', values: ['a', 'b'] } })
    expect(result.ranking).toEqual([
      { index: 0, relevanceScore: 0.5 },
      { index: 1, relevanceScore: -2 },
    ])
  })

  it('throws a retryable API error on a rate limit', async () => {
    stubFetch(429, { status: 429, title: 'Too Many Requests' })
    const error = await Promise.resolve(
      nvidiaReranker('k').doRerank({ query: 'q', documents: { type: 'text', values: ['a'] } }),
    ).catch((e: unknown) => e)
    expect(APICallError.isInstance(error)).toBe(true)
    expect((error as APICallError).statusCode).toBe(429)
    expect((error as APICallError).isRetryable).toBe(true)
  })
})
