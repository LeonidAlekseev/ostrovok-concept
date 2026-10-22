import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { embed, rerank } from 'ai'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'
import { getSecret } from '../secrets'
import { embeddingModel, toVector } from './embedding'
import { openRouterReranker } from './rerank'

/**
 * Search by meaning over the vectors of `npm run db:embed`: the query's vector, the nearest objects in
 * pgvector, then the reranker. Every failure — no key, no vectors yet, a model error, the time out — gives
 * `null`, and the caller keeps its rules; the traveller never sees an error.
 */

export type SemanticKind = 'hotel' | 'route'

export interface SemanticHit {
  id: string
  destinationId: string
  /** The reranker's relevance, or the cosine similarity when the reranker failed; higher is closer. */
  score: number
}

/**
 * The whole search, the query's vector, pgvector and the reranker together. The free embedding model answers
 * in 2–14 s (October 2026), the reranker in about 1.5 s.
 */
export const SEMANTIC_TIMEOUT_MS = 8000
/** The query's text is cut to this many characters. */
export const MAX_SEMANTIC_QUERY = 1000
/** Most nearest vectors a search reranks. */
const MAX_CANDIDATES = 50
/** Most hotels a traveller's profile averages. */
const MAX_PROFILE = 50

/** Vectors of recent queries: the vibe's answers repeat, and the free model is slow and counts requests a day. */
const queryVectors = new Map<string, number[]>()
const QUERY_CACHE = 500

async function queryVector(apiKey: string, query: string, abortSignal: AbortSignal): Promise<number[]> {
  const cached = queryVectors.get(query)
  if (cached) return cached
  const { embedding } = await embed({
    model: embeddingModel(apiKey, 'query'),
    value: query,
    abortSignal,
    maxRetries: 0,
  })
  // The oldest entry goes first: a Map keeps the order of insertion.
  if (queryVectors.size >= QUERY_CACHE) queryVectors.delete(queryVectors.keys().next().value!)
  queryVectors.set(query, embedding)
  return embedding
}

/** The catalog's database with the anon key: the functions are `security definer`, the table is closed. */
const database = () =>
  createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })

const warn = (what: string, error: unknown) =>
  // The kind and the provider's short message; never the query itself.
  console.warn(
    `semantic: ${what} (${error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : error})`,
  )

interface Match {
  ref_id: string
  destination_id: string
  content: string
  similarity: number
}

export interface SemanticOptions {
  kind: SemanticKind
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

/** The `k` objects of `kind` closest in meaning to `text`, best first, or `null` to fall back to the rules. */
export async function semanticSearch(
  text: string,
  { kind, destinationIds, k = 5, candidates = 30, timeoutMs = SEMANTIC_TIMEOUT_MS, signal }: SemanticOptions,
): Promise<SemanticHit[] | null> {
  const query = text.trim().slice(0, MAX_SEMANTIC_QUERY)
  if (!query || !isSupabaseConfigured || destinationIds?.length === 0) return null
  const apiKey = await getSecret('OPENROUTER_API_KEY')
  if (!apiKey) return null
  const timeout = AbortSignal.timeout(timeoutMs)
  const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout

  let matches: Match[]
  try {
    const embedding = await queryVector(apiKey, query, abortSignal)
    const { data, error } = await database()
      .rpc('match_embeddings', {
        query_embedding: toVector(embedding),
        match_kind: kind,
        destination_ids: destinationIds ?? null,
        match_count: Math.min(Math.max(candidates, k), MAX_CANDIDATES),
      })
      .abortSignal(abortSignal)
    if (error) throw new Error(error.message)
    matches = (data ?? []) as Match[]
  } catch (error) {
    warn('no vectors, using the rules', error)
    return null
  }
  if (matches.length === 0) return null

  const hit = (match: Match, score: number): SemanticHit => ({
    id: match.ref_id,
    destinationId: match.destination_id,
    score,
  })
  try {
    const { ranking } = await rerank({
      model: openRouterReranker(apiKey),
      query,
      documents: matches.map((m) => m.content),
      topN: Math.min(k, matches.length),
      abortSignal,
      maxRetries: 0,
    })
    return ranking.map(({ originalIndex, score }) => hit(matches[originalIndex], score))
  } catch (error) {
    // The vectors' own order is still by meaning: better than the rules.
    warn('the reranker failed, using the vectors’ order', error)
    return matches.slice(0, k).map((m) => hit(m, m.similarity))
  }
}

/**
 * The other hotels of `hotelId`'s city, the most alike first. `profile` is the traveller's hotels — the
 * favourites, the bookings and the plans (they live in the browser, so the caller sends their ids): with
 * them the order leans to the traveller's taste, without them it is the likeness to the hotel alone.
 * `null` when the hotel has no vector or the database failed.
 */
export async function similarHotels(
  hotelId: string,
  profile: readonly string[] = [],
  k = 10,
): Promise<Omit<SemanticHit, 'destinationId'>[] | null> {
  if (!isSupabaseConfigured) return null
  try {
    const { data, error } = await database()
      .rpc('similar_hotels', {
        hotel_id: hotelId,
        profile_ids: [...new Set(profile)].slice(0, MAX_PROFILE),
        match_count: k,
      })
      .abortSignal(AbortSignal.timeout(SEMANTIC_TIMEOUT_MS))
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as { ref_id: string; score: number }[]
    if (rows.length === 0) return null
    return rows.map((row) => ({ id: row.ref_id, score: row.score }))
  } catch (error) {
    warn('similar hotels failed', error)
    return null
  }
}
