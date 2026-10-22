// Embeds the catalog for the semantic search: every hotel (and every route, once the `routes` table exists)
// gets a vector from nvidia/nemotron-3.5-embed-8b in the `embeddings` table.
//   npm run db:embed   (Node runs the TypeScript itself; the keys come from .env.local, see README «Ключи API»)
// Only new and changed objects go to the model (`content_hash`); vectors of removed objects are deleted.
// Batches of BATCH texts; a 429 or a 5xx is retried with a growing pause. Needs NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY and OPENROUTER_API_KEY; prints counts, never the keys. Exits with 1 on errors.
import { createHash } from 'node:crypto'
import { registerHooks } from 'node:module'
import { setTimeout as sleep } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { APICallError, embedMany } from 'ai'

// The app's modules import each other without extensions, as the bundler allows; Node needs `.ts`.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  },
})

const { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, embeddingModel, toVector } = await import('../src/lib/ai/embedding.ts')
const { hotelDocument, routeDocument } = await import('../src/lib/ai/documents.ts')
const { vibeScale } = await import('../src/lib/vibe.ts')

type Destination = import('../src/data/destinations.ts').Destination
type Hotel = import('../src/lib/catalog.ts').Hotel
type RouteText = import('../src/lib/ai/documents.ts').RouteText

const BATCH = 32
const PAGE = 1000
const ATTEMPTS = 6

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set: run npm run secrets:reveal`)
  return value
}

const supabase = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const model = embeddingModel(required('OPENROUTER_API_KEY'), 'passage')

/** Every row of `table`, page by page; `null` when the table does not exist yet. */
async function readAll<T>(table: string, columns: string, orderBy = ['id']): Promise<T[] | null> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const query = orderBy.reduce((q, column) => q.order(column), supabase.from(table).select(columns))
    const { data, error } = await query.range(from, from + PAGE - 1)
    // PGRST205: no such table in the schema cache.
    if (error?.code === 'PGRST205' || error?.code === '42P01') return null
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data as T[]))
    if (data.length < PAGE) return rows
  }
}

interface Document {
  kind: 'hotel' | 'route'
  ref_id: string
  destination_id: string
  content: string
  content_hash: string
}

const hash = (content: string) =>
  createHash('sha256').update(`${EMBEDDING_MODEL}\n${EMBEDDING_DIMENSIONS}\n${content}`).digest('hex')

const destinations = ((await readAll<{ data: Destination }>('destinations', 'data')) ?? []).map((row) => row.data)
const cityOf = new Map(destinations.map((d) => [d.id, d]))
const hotels = ((await readAll<{ data: Hotel }>('hotels', 'data')) ?? []).map((row) => row.data)
const routes = await readAll<{ id: string; destination_id: string; data: RouteText }>(
  'routes',
  'id, destination_id, data',
)

const scale = vibeScale(hotels, destinations)
const documents: Document[] = []
for (const hotel of hotels) {
  const city = cityOf.get(hotel.destinationId)
  if (!city) continue
  const content = hotelDocument(hotel, city, scale)
  documents.push({ kind: 'hotel', ref_id: hotel.id, destination_id: city.id, content, content_hash: hash(content) })
}
for (const route of routes ?? []) {
  const city = cityOf.get(route.destination_id)
  if (!city) continue
  const content = routeDocument(route.data, city)
  documents.push({ kind: 'route', ref_id: route.id, destination_id: city.id, content, content_hash: hash(content) })
}

const stored = (await readAll<{ kind: string; ref_id: string; content_hash: string }>(
  'embeddings',
  'kind, ref_id, content_hash',
  ['kind', 'ref_id'],
))!
const key = (row: { kind: string; ref_id: string }) => `${row.kind}:${row.ref_id}`
const storedHash = new Map(stored.map((row) => [key(row), row.content_hash]))
const todo = documents.filter((d) => storedHash.get(key(d)) !== d.content_hash)

/** The batch's vectors; a retryable error (429, 5xx, network) waits 2, 4, 8… s and tries again. */
async function embedBatch(values: string[]): Promise<number[][]> {
  for (let attempt = 1; ; attempt++) {
    try {
      const { embeddings } = await embedMany({ model, values, maxRetries: 0 })
      return embeddings
    } catch (error) {
      const retryable = !APICallError.isInstance(error) || error.isRetryable
      if (!retryable || attempt === ATTEMPTS) throw error
      const pause = 2 ** attempt * 1000
      console.warn(
        `  retry ${attempt}/${ATTEMPTS - 1} in ${pause / 1000} s (${(error as Error).message.slice(0, 120)})`,
      )
      await sleep(pause)
    }
  }
}

let embedded = 0
let errors = 0
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH)
  try {
    const vectors = await embedBatch(batch.map((d) => d.content))
    if (vectors.some((v) => v.length !== EMBEDDING_DIMENSIONS))
      throw new Error(`the model returned ${vectors[0]?.length} numbers, the table holds ${EMBEDDING_DIMENSIONS}`)
    const updatedAt = new Date().toISOString()
    const { error } = await supabase.from('embeddings').upsert(
      batch.map((d, j) => ({ ...d, model: EMBEDDING_MODEL, embedding: toVector(vectors[j]), updated_at: updatedAt })),
      { onConflict: 'kind,ref_id' },
    )
    if (error) throw new Error(error.message)
    embedded += batch.length
    console.log(`  ${embedded + errors}/${todo.length}`)
  } catch (error) {
    errors += batch.length
    console.error(`  batch ${i / BATCH + 1}: ${(error as Error).message.slice(0, 200)}`)
  }
}

// Vectors of hotels and routes that are gone from the catalog.
const current = new Set(documents.map(key))
const stale = stored.filter((row) => !current.has(key(row)))
for (const row of stale) {
  const { error } = await supabase.from('embeddings').delete().eq('kind', row.kind).eq('ref_id', row.ref_id)
  if (error) throw new Error(`embeddings: ${error.message}`)
}

const hotelCount = documents.filter((d) => d.kind === 'hotel').length
const routeCount = routes ? `${documents.length - hotelCount} routes` : 'no routes table'
console.log(
  `embeddings: ${documents.length} objects (${hotelCount} hotels, ${routeCount}), ${embedded} embedded, ` +
    `${documents.length - todo.length} unchanged, ${errors} errors, ${stale.length} deleted`,
)
if (errors) process.exit(1)
