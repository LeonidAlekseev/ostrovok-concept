import type { RerankingModel } from 'ai'
import { z } from 'zod'
import { postNvidia } from './nvidia'

/**
 * `nvidia/nemotron-3.5-rerank-8b` for `rerank()` of the AI SDK: the NVIDIA API has its own reranking endpoint,
 * outside the OpenAI-compatible one, so this adapter calls it itself. No `server-only`, so that the quality check
 * (scripts/semantic-eval.ts) can use it too: the caller brings the key.
 */

export const RERANK_MODEL = 'nvidia/nemotron-3.5-rerank-8b'
export const RERANK_URL = 'https://ai.api.nvidia.com/v1/retrieval/nvidia/nemotron-3.5-rerank-8b/reranking'

type RerankingModelV4 = Extract<RerankingModel, { specificationVersion: 'v4' }>

/** Every passage, best first; the score is the model's raw logit, higher is closer. */
const responseSchema = z.object({
  rankings: z.array(z.object({ index: z.number().int().nonnegative(), logit: z.number() })),
})

export function nvidiaReranker(apiKey: string, modelId = RERANK_MODEL): RerankingModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'nvidia',
    modelId,
    async doRerank({ documents, query, topN, abortSignal, headers }) {
      const passages = documents.type === 'text' ? documents.values : documents.values.map((v) => JSON.stringify(v))
      const { value, responseHeaders } = await postNvidia(
        RERANK_URL,
        apiKey,
        // The API ranks all the passages: `topN` is applied here.
        { model: modelId, query: { text: query }, passages: passages.map((text) => ({ text })), truncate: 'END' },
        { abortSignal, headers },
      )
      const ranking = responseSchema
        .parse(value)
        .rankings.filter((r) => r.index < passages.length)
        .toSorted((a, b) => b.logit - a.logit)
        .map((r) => ({ index: r.index, relevanceScore: r.logit }))
      return {
        ranking: topN === undefined ? ranking : ranking.slice(0, topN),
        response: { modelId, headers: responseHeaders },
      }
    },
  }
}
