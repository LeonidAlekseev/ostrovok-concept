import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { embed, rerank } from 'ai'
import { isVisibleHotel } from '@/lib/catalog'
import type { Database } from '@/lib/db/database.types'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'
import { getSecret } from '../secrets'
import { embeddingModel, toVector } from './embedding'
import { NVIDIA_KEY } from './nvidia'
import { nvidiaReranker } from './rerank'

/**
 * Search by meaning over the vectors of `npm run db:embed`: the query's vector, the nearest objects in
 * pgvector, then the reranker. The result tells «found», «nothing found» and a failure with its reason apart — no
 * key, the time out, a model or a database error; the caller keeps its rules in the last two, and the traveller
 * never sees an error.
 */

export interface SemanticHit {
  id: string
  destinationId: string
  /** The reranker's relevance, or the cosine similarity when the reranker failed; higher is closer. */
  score: number
}

export type SemanticFailure = 'no-key' | 'timeout' | 'aborted' | 'model' | 'database'

export type SemanticResult =
  { status: 'found'; hits: SemanticHit[] } | { status: 'empty' } | { status: 'failed'; reason: SemanticFailure }

const EMPTY: SemanticResult = { status: 'empty' }
const failed = (reason: SemanticFailure): SemanticResult => ({ status: 'failed', reason })

/**
 * The whole search, the query's vector, pgvector and the reranker together. On the NVIDIA API the embedding
 * answers in about 0.4 s and the reranker in about 0.8 s (October 2026), but a cold model may take far longer.
 */
export const SEMANTIC_TIMEOUT_MS = 8000
/** The query's text is cut to this many characters. */
export const MAX_SEMANTIC_QUERY = 1000
/** Most nearest vectors a search reranks. */
const MAX_CANDIDATES = 50

/**
 * Vectors of recent queries: the vibe's answers repeat, and the key allows 40 requests a minute.
 * The pending vector is kept too, so concurrent searches for the same words share one request.
 */
const queryVectors = new Map<string, Promise<number[]>>()
const QUERY_CACHE = 500

/**
 * A search that gives up on its own time out forgets the vector it waited for, when that is still the one in the
 * cache: the next search asks the model again instead of waiting for the stalled request. The request itself ends
 * by its own `AbortSignal.timeout`; the other searches waiting on it keep it.
 */
function forgetVector(query: string, vector: Promise<number[]>) {
  if (queryVectors.get(query) === vector) queryVectors.delete(query)
}

/** The shared request has its own limit: a search that gives up does not cancel the vector for the others. */
function queryVector(apiKey: string, query: string): Promise<number[]> {
  const cached = queryVectors.get(query)
  if (cached) return cached
  const vector = embed({
    model: embeddingModel(apiKey, 'query'),
    value: query,
    abortSignal: AbortSignal.timeout(SEMANTIC_TIMEOUT_MS),
    maxRetries: 0,
  }).then(({ embedding }) => embedding)
  // A failed request is not kept: the next search asks again.
  vector.catch(() => queryVectors.delete(query))
  // The oldest entry goes first: a Map keeps the order of insertion.
  if (queryVectors.size >= QUERY_CACHE) queryVectors.delete(queryVectors.keys().next().value!)
  queryVectors.set(query, vector)
  return vector
}

/** Waits for `promise`, but rejects as soon as `signal` aborts; the promise itself is left running. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/** The catalog's database with the anon key: the functions are `security definer`, the table is closed. */
const database = () =>
  createClient<Database>(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })

const warn = (what: string, error: unknown) =>
  // The kind and the provider's short message; never the query itself.
  console.warn(
    `semantic: ${what} (${error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : error})`,
  )

type Match = Database['public']['Functions']['match_embeddings']['Returns'][number]

export interface SemanticOptions {
  /** Only objects in these cities; all cities when absent. */
  destinationIds?: readonly string[]
  /** Hits to return. */
  k?: number
  /** Nearest vectors to rerank, at least `k`. */
  candidates?: number
  /** The search's own limit; the caller lowers it to fit its answer in time. */
  timeoutMs?: number
  signal?: AbortSignal
}

/**
 * The `k` hotels shown (`isVisibleHotel`) closest in meaning to `text`, best first; `empty` when there are none,
 * `failed` with the reason when the search could not answer.
 */
export async function semanticSearch(
  text: string,
  { destinationIds, k = 5, candidates = 30, timeoutMs = SEMANTIC_TIMEOUT_MS, signal }: SemanticOptions,
): Promise<SemanticResult> {
  const query = text.trim().slice(0, MAX_SEMANTIC_QUERY)
  if (!query || destinationIds?.length === 0) return EMPTY
  if (!isSupabaseConfigured) return failed('database')
  const apiKey = await getSecret(NVIDIA_KEY)
  if (!apiKey) return failed('no-key')
  const timeout = AbortSignal.timeout(timeoutMs)
  const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout

  // The caller's own abort is not the search's time out.
  const reasonOf = (stage: 'model' | 'database'): SemanticFailure =>
    signal?.aborted ? 'aborted' : timeout.aborted ? 'timeout' : stage

  let matches: Match[]
  let stage: 'model' | 'database' = 'model'
  let vector: Promise<number[]> | undefined
  try {
    vector = queryVector(apiKey, query)
    const embedding = await untilAborted(vector, abortSignal)
    stage = 'database'
    const { data, error } = await database()
      .rpc('match_embeddings', {
        query_embedding: toVector(embedding),
        match_kind: 'hotel',
        destination_ids: destinationIds ? [...destinationIds] : undefined,
        match_count: Math.min(Math.max(candidates, k), MAX_CANDIDATES),
      })
      .abortSignal(abortSignal)
    if (error) throw new Error(error.message)
    // The vectors cover the whole catalogue; only the hotels shown in this environment are found.
    matches = (data ?? []).filter((m) => isVisibleHotel({ id: m.ref_id }))
  } catch (error) {
    warn('no vectors, using the rules', error)
    const reason = reasonOf(stage)
    if (reason === 'timeout' && stage === 'model' && vector) forgetVector(query, vector)
    return failed(reason)
  }
  if (matches.length === 0) return EMPTY

  const hit = (match: Match, score: number): SemanticHit => ({
    id: match.ref_id,
    destinationId: match.destination_id,
    score,
  })
  try {
    const { ranking } = await rerank({
      model: nvidiaReranker(apiKey),
      query,
      documents: matches.map((m) => m.content),
      topN: Math.min(k, matches.length),
      abortSignal,
      maxRetries: 0,
    })
    return { status: 'found', hits: ranking.map(({ originalIndex, score }) => hit(matches[originalIndex], score)) }
  } catch (error) {
    // The vectors' own order is still by meaning: better than the rules.
    warn('the reranker failed, using the vectors’ order', error)
    return { status: 'found', hits: matches.slice(0, k).map((m) => hit(m, m.similarity)) }
  }
}
