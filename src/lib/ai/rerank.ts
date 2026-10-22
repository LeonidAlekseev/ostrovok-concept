import { APICallError, type RerankingModel } from 'ai'
import { z } from 'zod'

/**
 * `nvidia/nemotron-3.5-rerank-8b` for `rerank()` of the AI SDK: the OpenRouter provider has no reranking
 * models, so this adapter calls OpenRouter's `POST /api/v1/rerank` itself. No `server-only`, so that
 * the quality check (scripts/semantic-eval.ts) can use it too: the caller brings the key.
 */

export const RERANK_MODEL = 'nvidia/nemotron-3.5-rerank-8b:free'
export const RERANK_URL = 'https://openrouter.ai/api/v1/rerank'

type RerankingModelV4 = Extract<RerankingModel, { specificationVersion: 'v4' }>

const responseSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  results: z.array(z.object({ index: z.number().int().nonnegative(), relevance_score: z.number() })),
})

export function openRouterReranker(apiKey: string, modelId = RERANK_MODEL): RerankingModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'openrouter',
    modelId,
    async doRerank({ documents, query, topN, abortSignal, headers }) {
      const body = {
        model: modelId,
        query,
        documents: documents.type === 'text' ? documents.values : documents.values.map((v) => JSON.stringify(v)),
        top_n: topN,
      }
      const response = await fetch(RERANK_URL, {
        method: 'POST',
        headers: {
          ...Object.fromEntries(Object.entries(headers ?? {}).filter(([, value]) => value !== undefined)),
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: abortSignal,
      })
      const responseHeaders = Object.fromEntries(response.headers)
      const text = await response.text()
      // 408, 409, 429 and 5xx are retryable: `rerank()`'s `maxRetries` repeats them.
      if (!response.ok)
        throw new APICallError({
          message: `OpenRouter rerank: HTTP ${response.status}`,
          url: RERANK_URL,
          requestBodyValues: { model: modelId, top_n: topN, documents: body.documents.length },
          statusCode: response.status,
          responseHeaders,
          responseBody: text.slice(0, 500),
        })
      const parsed = responseSchema.parse(JSON.parse(text))
      return {
        ranking: parsed.results
          .filter((r) => r.index < body.documents.length)
          .map((r) => ({ index: r.index, relevanceScore: r.relevance_score })),
        response: { id: parsed.id, modelId: parsed.model ?? modelId, headers: responseHeaders },
      }
    },
  }
}
