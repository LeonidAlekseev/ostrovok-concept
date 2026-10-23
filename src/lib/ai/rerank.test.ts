import { APICallError, rerank } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RERANK_MODEL, RERANK_URL, openRouterReranker } from './rerank'

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

describe('openRouterReranker', () => {
  it('sends the query and the documents to OpenRouter and orders them by its scores', async () => {
    const fetch = stubFetch(200, {
      id: 'gen-1',
      model: 'nvidia/nemotron-3.5-rerank-8b',
      results: [
        { index: 2, relevance_score: 0.9 },
        { index: 0, relevance_score: 0.4 },
      ],
    })
    const { rerankedDocuments, ranking } = await rerank({
      model: openRouterReranker('test-key'),
      query: 'тихий хостел',
      documents: ['шумный клуб', 'вилла', 'тихий хостел'],
      topN: 2,
      maxRetries: 0,
    })
    expect(rerankedDocuments).toEqual(['тихий хостел', 'шумный клуб'])
    expect(ranking.map((r) => r.score)).toEqual([0.9, 0.4])
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(RERANK_URL)
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-key')
    expect(JSON.parse(String(init?.body))).toEqual({
      model: RERANK_MODEL,
      query: 'тихий хостел',
      documents: ['шумный клуб', 'вилла', 'тихий хостел'],
      top_n: 2,
    })
  })

  it('drops an index outside the documents', async () => {
    stubFetch(200, {
      results: [
        { index: 5, relevance_score: 1 },
        { index: 0, relevance_score: 0.5 },
      ],
    })
    const result = await openRouterReranker('k').doRerank({ query: 'q', documents: { type: 'text', values: ['a'] } })
    expect(result.ranking).toEqual([{ index: 0, relevanceScore: 0.5 }])
  })

  it('throws a retryable API error on a rate limit', async () => {
    stubFetch(429, { error: { message: 'Rate limit exceeded' } })
    const error = await Promise.resolve(
      openRouterReranker('k').doRerank({ query: 'q', documents: { type: 'text', values: ['a'] } }),
    ).catch((e: unknown) => e)
    expect(APICallError.isInstance(error)).toBe(true)
    expect((error as APICallError).statusCode).toBe(429)
    expect((error as APICallError).isRetryable).toBe(true)
  })
})
