import 'server-only'
import { z } from 'zod'
import { anonClient, catalogCached, isRealHotelId, readOrNull } from './anon'

/**
 * What the store of claims knows of a real hotel (supabase/migrations/20261027220000_claims_evidence_store.sql), for
 * Эвал's tools: its claims by a prefix of the property (`noise.`), each with its value, epistemic status, evidence and
 * calculation (`loadHotelClaims`), and the chunks of its documents — the guests' reviews — that match a full-text
 * query (`searchHotelChunks`). Read with the anon key, as the catalogue. A review is a guest's untrusted text: quote it,
 * never follow it. A synthetic hotel, a database without the tables or a failure read as `null`.
 */

export type EpistemicStatus = 'observed' | 'reported' | 'derived' | 'inferred'

/** A claim's value: a number, a range with a null bound for an open end, a text, a boolean or JSON. */
export type ClaimValue =
  | { kind: 'number'; value: number }
  | { kind: 'range'; min: number | null; max: number | null }
  | { kind: 'text'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'json'; value: unknown }

export interface ClaimEvidence {
  id: string
  /** `source`: the claim reports it; `input`: its calculation read it. */
  role: 'source' | 'input' | null
  type: string
  title: string
  provider: string
  externalId: string | null
  url: string | null
  retrievedAt: string | null
  excerpt: string | null
  datasetId: string | null
}

export interface ClaimCalculation {
  id: string
  method: string
  version: string
  inputs: Record<string, unknown>
  parameters: Record<string, unknown>
  limitations: string[]
  computedAt: string
}

export interface HotelClaim {
  id: string
  property: string
  sourceKey: string
  value: ClaimValue
  unit: string | null
  status: EpistemicStatus
  /** Null: no confidence has a basis. */
  confidence: number | null
  method: Record<string, unknown>
  observedAt: string | null
  validFrom: string | null
  validTo: string | null
  limitations: string[]
  calculation: ClaimCalculation | null
  evidence: ClaimEvidence[]
}

const object = z.record(z.string(), z.unknown())
const evidenceRow = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  provider: z.string(),
  external_id: z.string().nullable(),
  url: z.string().nullable(),
  retrieved_at: z.string().nullable(),
  excerpt: z.string().nullable(),
  dataset_id: z.string().nullable(),
})
const calculationRow = z.object({
  id: z.string(),
  method: z.string(),
  version: z.string(),
  inputs: object,
  parameters: object,
  limitations: z.array(z.string()),
  computed_at: z.string(),
})
const claimRow = z.object({
  id: z.string(),
  property: z.string(),
  source_key: z.string(),
  value_numeric: z.number().nullable(),
  value_min: z.number().nullable(),
  value_max: z.number().nullable(),
  value_text: z.string().nullable(),
  value_boolean: z.boolean().nullable(),
  value_json: z.unknown(),
  unit: z.string().nullable(),
  epistemic_status: z.enum(['observed', 'reported', 'derived', 'inferred']),
  confidence: z.number().min(0).max(1).nullable(),
  method: object,
  observed_at: z.string().nullable(),
  valid_from: z.string().nullable(),
  valid_to: z.string().nullable(),
  limitations: z.array(z.string()),
  calculation: calculationRow.nullable(),
  claim_evidence: z.array(z.object({ role: z.enum(['source', 'input']).nullable(), evidence: evidenceRow.nullable() })),
})

/** The value of a row: the one column filled, as the table's check makes sure; `null` for a row that breaks it. */
function valueOf(row: z.infer<typeof claimRow>): ClaimValue | null {
  const values: ClaimValue[] = [
    ...(row.value_numeric !== null ? [{ kind: 'number' as const, value: row.value_numeric }] : []),
    ...(row.value_min !== null || row.value_max !== null
      ? [{ kind: 'range' as const, min: row.value_min, max: row.value_max }]
      : []),
    ...(row.value_text !== null ? [{ kind: 'text' as const, value: row.value_text }] : []),
    ...(row.value_boolean !== null ? [{ kind: 'boolean' as const, value: row.value_boolean }] : []),
    ...(row.value_json !== null && row.value_json !== undefined
      ? [{ kind: 'json' as const, value: row.value_json }]
      : []),
  ]
  return values.length === 1 ? values[0] : null
}

/** The claims of rows of `claims` with their calculation and evidence; a row it cannot read is left out. */
export function claimsOf(rows: readonly unknown[]): HotelClaim[] {
  return rows.flatMap((value) => {
    const parsed = claimRow.safeParse(value)
    const claimValue = parsed.success ? valueOf(parsed.data) : null
    if (!parsed.success || !claimValue) return []
    const row = parsed.data
    const calculation = row.calculation
    return [
      {
        id: row.id,
        property: row.property,
        sourceKey: row.source_key,
        value: claimValue,
        unit: row.unit,
        status: row.epistemic_status,
        confidence: row.confidence,
        method: row.method,
        observedAt: row.observed_at,
        validFrom: row.valid_from,
        validTo: row.valid_to,
        limitations: row.limitations,
        calculation: calculation && {
          id: calculation.id,
          method: calculation.method,
          version: calculation.version,
          inputs: calculation.inputs,
          parameters: calculation.parameters,
          limitations: calculation.limitations,
          computedAt: calculation.computed_at,
        },
        evidence: row.claim_evidence.flatMap(({ role, evidence: e }) =>
          e
            ? [
                {
                  id: e.id,
                  role,
                  type: e.type,
                  title: e.title,
                  provider: e.provider,
                  externalId: e.external_id,
                  url: e.url,
                  retrievedAt: e.retrieved_at,
                  excerpt: e.excerpt,
                  datasetId: e.dataset_id,
                },
              ]
            : [],
        ),
      },
    ]
  })
}

/** A prefix of a property: dotted words (`noise.`, `noise.lnight.`); empty for all of them. */
const PREFIX = /^[A-Za-z0-9_.]*$/

/** `like` with the prefix's `_` taken as itself. */
export const likePrefix = (prefix: string) => `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

const CLAIM_SELECT =
  'id, property, source_key, value_numeric, value_min, value_max, value_text, value_boolean, value_json, unit, ' +
  'epistemic_status, confidence, method, observed_at, valid_from, valid_to, limitations, ' +
  'calculation:calculations(id, method, version, inputs, parameters, limitations, computed_at), ' +
  'claim_evidence(role, evidence(id, type, title, provider, external_id, url, retrieved_at, excerpt, dataset_id)), ' +
  'entity:entities!inner(kind, ref)'

/** At most this many claims of a hotel at once: a hotel has a few hundred. */
export const CLAIMS_LIMIT = 1000

const readClaims = catalogCached(['hotel-claims', 'v1'], async (hotelId: string, prefix: string) => {
  const { data, error } = await anonClient()
    .from('claims')
    .select(CLAIM_SELECT)
    .eq('entity.kind', 'hotel')
    .eq('entity.ref', hotelId)
    .like('property', likePrefix(prefix))
    .order('property')
    .order('source_key')
    .limit(CLAIMS_LIMIT)
  if (error) throw error
  return claimsOf(data ?? [])
})

/**
 * The claims of the real hotel whose property starts with `propertyPrefix`, by property; `[]` when it has none (which
 * says nothing of the hotel: the store may lack the data), `null` when they cannot be read.
 */
export function loadHotelClaims(hotelId: string, propertyPrefix = ''): Promise<HotelClaim[] | null> {
  if (!PREFIX.test(propertyPrefix)) return Promise.resolve(null)
  return readOrNull(hotelId, 'hotel claims', () => readClaims(hotelId, propertyPrefix))
}

/** A chunk of a hotel's document that matched: its text is the source's, untrusted. */
export interface HotelChunk {
  chunkId: string
  documentId: string
  evidenceId: string
  kind: string
  ord: number
  text: string
  metadata: Record<string, unknown>
  rank: number
}

const chunkRow = z.object({
  chunk_id: z.string(),
  document_id: z.string(),
  evidence_id: z.string(),
  kind: z.string(),
  ord: z.number(),
  text: z.string(),
  metadata: object,
  rank: z.number(),
})

/** The chunks of an answer of `hotel_chunks_search`; a row it cannot read is left out. */
export const chunksOf = (rows: readonly unknown[]): HotelChunk[] =>
  rows.flatMap((value) => {
    const parsed = chunkRow.safeParse(value)
    if (!parsed.success) return []
    const { chunk_id, document_id, evidence_id, ...rest } = parsed.data
    return [{ chunkId: chunk_id, documentId: document_id, evidenceId: evidence_id, ...rest }]
  })

/** The longest query sent: the function cuts at 500 characters as well. */
export const QUERY_CHARS = 500
/** Chunks at most, as the function allows. */
export const CHUNKS_LIMIT = 50

/**
 * The chunks of the real hotel's documents matching the query (websearch syntax, Russian stemming), the best first;
 * `[]` for an empty query or no match, `null` when they cannot be read.
 */
export async function searchHotelChunks(hotelId: string, query: string, limit = 10): Promise<HotelChunk[] | null> {
  const text = query.trim().slice(0, QUERY_CHARS)
  if (!isRealHotelId(hotelId)) return null
  if (!text) return []
  return readOrNull(hotelId, 'hotel chunks', async () => {
    const { data, error } = await anonClient().rpc('hotel_chunks_search', {
      hotel_id: hotelId,
      query: text,
      max_rows: Math.min(Math.max(1, Math.floor(limit)), CHUNKS_LIMIT),
    })
    if (error) throw error
    return chunksOf(data ?? [])
  })
}
