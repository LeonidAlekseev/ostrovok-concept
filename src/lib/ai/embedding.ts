import { createOpenRouter } from '@openrouter/ai-sdk-provider'

/**
 * The embeddings of the semantic search (supabase/migrations/*_embeddings.sql). Shared by the server and by
 * `npm run db:embed`, so no `server-only` here: the caller brings the key.
 */

export const EMBEDDING_MODEL = 'nvidia/nemotron-3.5-embed-8b:free'
/**
 * The model gives 4096 numbers and HNSW indexes at most 4000, so it is asked for the first 2048 (it is
 * Matryoshka-trained); the table's column is `halfvec(2048)`.
 */
export const EMBEDDING_DIMENSIONS = 2048

/**
 * The model embeds a search query and a document differently (`input_type`); the provider passes neither
 * that nor the dimensions on its own, so both go in the request's body.
 */
export const embeddingModel = (apiKey: string, inputType: 'query' | 'passage') =>
  createOpenRouter({ apiKey }).textEmbeddingModel(EMBEDDING_MODEL, {
    extraBody: { dimensions: EMBEDDING_DIMENSIONS, input_type: inputType },
  })

/** A vector as pgvector reads it from PostgREST: `[0.1,0.2,…]`. */
export const toVector = (embedding: readonly number[]) => `[${embedding.join(',')}]`
