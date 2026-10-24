import type { EmbeddingModel } from 'ai'
import { z } from 'zod'
import { NVIDIA_BASE_URL, postNvidia } from './nvidia'

/**
 * The embeddings of the semantic search (supabase/migrations/*_embeddings.sql). Shared by the server and by
 * `npm run db:embed`, so no `server-only` here: the caller brings the key.
 */

export const EMBEDDING_MODEL = 'nvidia/nemotron-3.5-embed-8b'
/**
 * The model gives 4096 numbers and HNSW indexes at most 4000, so the first 2048 are kept and normalized again
 * (the model is Matryoshka-trained; the NVIDIA API has no `dimensions`); the table's column is `halfvec(2048)`.
 */
export const EMBEDDING_DIMENSIONS = 2048
export const EMBEDDING_URL = `${NVIDIA_BASE_URL}/embeddings`

type EmbeddingModelV4 = Extract<EmbeddingModel, { specificationVersion: 'v4' }>

const responseSchema = z.object({
  data: z.array(z.object({ index: z.number().int().nonnegative().optional(), embedding: z.array(z.number()) })),
  usage: z.object({ prompt_tokens: z.number() }).nullish(),
})

/** The first `dimensions` numbers of `vector`, scaled back to length 1 for the cosine. */
export function truncate(vector: readonly number[], dimensions = EMBEDDING_DIMENSIONS): number[] {
  const head = vector.slice(0, dimensions)
  const norm = Math.hypot(...head)
  return norm > 0 ? head.map((x) => x / norm) : head
}

/**
 * The model embeds a search query and a document differently (`input_type`). The AI SDK's OpenAI-compatible
 * provider sends neither that nor `truncate`, so this adapter calls the API itself.
 */
export const embeddingModel = (apiKey: string, inputType: 'query' | 'passage'): EmbeddingModelV4 => ({
  specificationVersion: 'v4',
  provider: 'nvidia',
  modelId: EMBEDDING_MODEL,
  maxEmbeddingsPerCall: 64,
  supportsParallelCalls: false,
  async doEmbed({ values, abortSignal, headers }) {
    const { value, responseHeaders } = await postNvidia(
      EMBEDDING_URL,
      apiKey,
      // `truncate: END` cuts a text longer than the model's context instead of failing it.
      { model: EMBEDDING_MODEL, input: values, input_type: inputType, encoding_format: 'float', truncate: 'END' },
      { abortSignal, headers },
    )
    const { data, usage } = responseSchema.parse(value)
    const ordered = data.every((d) => d.index !== undefined) ? data.toSorted((a, b) => a.index! - b.index!) : data
    return {
      embeddings: ordered.map((d) => truncate(d.embedding)),
      usage: usage ? { tokens: usage.prompt_tokens } : undefined,
      response: { headers: responseHeaders },
      warnings: [],
    }
  },
})

/** A vector as pgvector reads it from PostgREST: `[0.1,0.2,…]`. */
export const toVector = (embedding: readonly number[]) => `[${embedding.join(',')}]`
