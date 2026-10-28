// Embeds the chunks of the hotels' documents — the guests' reviews and the hotels' knowledge from their hoteliers — for
// the hybrid search (`hotel_chunks_hybrid`): each chunk gets its vector from nvidia/nemotron-3.5-embed-1b in
// `document_chunks.embedding`, as a passage.
//   npm run db:embed:chunks
// Idempotent: `content_hash` (the model, the dimensions and the text) is set only with the vector, so only the chunks
// without one or whose text changed go to the model. A chunk rewritten between the read and the write (`updated_at`)
// keeps no vector of the old text. Batches of BATCH texts, at most 40 requests a minute;
// a 429 or a 5xx is retried with a pause. A chunk not embedded is still found by its words. Needs
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NVIDIA_API_KEY; prints counts, never the texts or the keys.
// Exits with 1 on errors.
import { embedMany } from 'ai'
import { required, serviceClient } from './lib/node.ts'

const { EMBEDDING_DIMENSIONS, contentHash, embeddingModel, toVector } = await import('../src/lib/ai/embedding.ts')
const { NVIDIA_KEY, pacer, withRetry } = await import('../src/lib/ai/nvidia.ts')

const BATCH = 32
const PAGE = 1000
/** Rows written at once: one update a chunk. */
const WRITES = 8

const supabase = serviceClient()
const model = embeddingModel(required(NVIDIA_KEY), 'passage')
const turn = pacer()

interface Chunk {
  id: string
  text: string
  content_hash: string | null
  updated_at: string
}

const chunks: Chunk[] = []
for (let from = 0; ; from += PAGE) {
  const { data, error } = await supabase
    .from('document_chunks')
    .select('id, text, content_hash, updated_at')
    .order('id')
    .range(from, from + PAGE - 1)
  if (error) throw new Error(`document_chunks: ${error.message}`)
  chunks.push(...data)
  if (data.length < PAGE) break
}
const todo = chunks.filter((c) => c.content_hash !== contentHash(c.text))

/** The batch's vectors; each try waits its turn under the limit, a retryable error (429, 5xx, network) is tried again. */
async function embedBatch(values: string[]): Promise<number[][]> {
  return withRetry(
    async () => {
      await turn()
      const { embeddings } = await embedMany({ model, values, maxRetries: 0 })
      return embeddings
    },
    { onRetry: (message) => console.warn(`  ${message}`) },
  )
}

/** Writes the chunk's vector unless the chunk was rewritten meanwhile; whether it was written. */
async function write(chunk: Chunk, vector: readonly number[]): Promise<boolean> {
  const { data, error } = await supabase
    .from('document_chunks')
    .update({ embedding: toVector(vector), content_hash: contentHash(chunk.text) })
    .eq('id', chunk.id)
    .eq('updated_at', chunk.updated_at)
    .select('id')
  if (error) throw new Error(error.message)
  return data.length > 0
}

let embedded = 0
let changed = 0
let errors = 0
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH)
  try {
    const vectors = await embedBatch(batch.map((c) => c.text))
    if (vectors.length !== batch.length || vectors.some((v) => v.length !== EMBEDDING_DIMENSIONS))
      throw new Error(`the model returned ${vectors[0]?.length} numbers, the column holds ${EMBEDDING_DIMENSIONS}`)
    for (let j = 0; j < batch.length; j += WRITES) {
      const written = await Promise.all(batch.slice(j, j + WRITES).map((c, k) => write(c, vectors[j + k])))
      embedded += written.filter(Boolean).length
      changed += written.filter((ok) => !ok).length
    }
    console.log(`  ${embedded + changed + errors}/${todo.length}`)
  } catch (error) {
    errors += batch.length
    console.error(`  batch ${i / BATCH + 1}: ${(error as Error).message.slice(0, 200)}`)
  }
}

console.log(
  `document chunks: ${chunks.length} chunks, ${embedded} embedded, ${chunks.length - todo.length} unchanged, ` +
    `${changed} changed meanwhile, ${errors} errors`,
)
if (errors) process.exit(1)
