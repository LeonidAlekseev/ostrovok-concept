import { createHash } from 'node:crypto'
import type { EmbeddingModel } from 'ai'
import { z } from 'zod'
import { NVIDIA_BASE_URL, postNvidia } from './nvidia'

/**
 * The embeddings of the semantic search (supabase/migrations/*_embeddings.sql). Shared by the server and by
 * `npm run db:embed`, so no `server-only` here: the caller brings the key.
 */

export const EMBEDDING_MODEL = 'nvidia/nemotron-3.5-embed-1b'
/**
 * The model gives 2048 numbers, the table's column is `halfvec(2048)` (HNSW indexes at most 4000). `truncate` keeps
 * the first `EMBEDDING_DIMENSIONS` and normalizes again, so a longer vector (the 4096 of the former 8b model) still fits.
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

/**
 * What `embeddings.content_hash` holds: the model and the dimensions go in with the text, so a vector made by another
 * model counts as changed and `npm run db:embed` embeds it again.
 */
export const contentHash = (content: string) =>
  createHash('sha256').update(`${EMBEDDING_MODEL}\n${EMBEDDING_DIMENSIONS}\n${content}`).digest('hex')
