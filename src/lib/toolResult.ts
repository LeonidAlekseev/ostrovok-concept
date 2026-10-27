import { z } from 'zod'

/**
 * The one contract of what Эвал's tool gives back (docs/tools.md): its status, a short summary, its own data, the
 * sources it read (`evidence`), the characteristics it got from them (`claims`) with their origin, the calculations and
 * the method they came of, the limitations and the error. The server validates a tool's output with `toolResultSchema`
 * before it goes anywhere; the browser parses the answer, the saved chats and the shared snapshots with `parseToolRun`.
 * A source is only ever what the tool read from the database or a provider — never words of a model: no source is an
 * empty `evidence`, said so in the block.
 */

/** A link the block may open: http(s) only. */
export const isSafeUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

const text = (max: number) => z.string().max(max)
const id = text(100).min(1)
const safeUrl = text(2000).refine(isSafeUrl, 'Only http(s) links')

/** The source types of the store's `evidence.type`. */
export const SOURCE_TYPES = ['dataset', 'osm', 'review', 'ota_page', 'calculation'] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

/** How a characteristic is known: seen by an instrument, said by a source, calculated by a method, guessed. */
export const EPISTEMIC_STATUSES = ['observed', 'reported', 'derived', 'inferred'] as const
export type EpistemicStatus = (typeof EPISTEMIC_STATUSES)[number]

export const EPISTEMIC_LABEL: Record<EpistemicStatus, string> = {
  observed: 'наблюдено',
  reported: 'сообщено источником',
  derived: 'рассчитано',
  inferred: 'выведено',
}

/** A source the tool read: a dataset, an OSM element, a guest's review, a page of Островок. */
export const toolEvidenceSchema = z.object({
  id,
  source_type: z.enum(SOURCE_TYPES),
  /** The provider: «EEA», «OpenStreetMap», «Островок». */
  source_name: text(200).min(1),
  /** The provider's own id of it: the dataset's, `node/123`, the review's. */
  source_id: text(200).nullable(),
  source_url: safeUrl.nullable(),
  title: text(300).min(1),
  /** The words of the source the tool used, as the source has them: untrusted, shown as a quote. */
  excerpt: text(1000).nullable(),
  /** ISO time the source was fetched; null when unknown. */
  retrieved_at: text(40).nullable(),
  entity_id: text(100).nullable(),
  claim_id: text(100).nullable(),
})
export type ToolEvidence = z.infer<typeof toolEvidenceSchema>

/** A line of a calculation's inputs or parameters, in Russian: «Lden» — «60–64 дБ». */
const lineSchema = z.object({ label: text(200).min(1), value: text(500) })

/** How a value was calculated: the method and its version, what it read, what it assumed. */
export const toolMethodSchema = z.object({
  name: text(300).min(1),
  version: text(100).min(1),
  inputs: z.array(lineSchema).max(20),
  assumptions: z.array(text(500)).max(20),
})
export type ToolMethod = z.infer<typeof toolMethodSchema>

export const toolCalculationSchema = toolMethodSchema.extend({ id })
export type ToolCalculation = z.infer<typeof toolCalculationSchema>

/** A characteristic the tool got, in Russian, with where it comes from. */
export const toolClaimSchema = z.object({
  id,
  /** «Ночью (Lnight), дороги города». */
  label: text(300).min(1),
  /** «55–59 дБ», «4», «42 м». */
  value: text(500),
  status: z.enum(EPISTEMIC_STATUSES),
  /** 0–1; null when no confidence has a basis, and then no number is shown. */
  confidence: z.number().min(0).max(1).nullable(),
  evidence_ids: z.array(id).max(50),
  calculation_id: id.nullable(),
})
export type ToolClaim = z.infer<typeof toolClaimSchema>

export const TOOL_STATUSES = ['running', 'success', 'error'] as const
export type ToolStatus = (typeof TOOL_STATUSES)[number]

export const toolErrorSchema = z.object({ code: text(100).min(1), message: text(500).min(1) })

/** At most this many of each list: a result stays far below the 100 KB of a message's data. */
export const MAX_EVIDENCE = 40
export const MAX_CLAIMS = 60
export const MAX_CALCULATIONS = 10
export const MAX_GROUPS = 20

/**
 * The characteristics of one thing the tool looked at — a hotel — with its verdict: the block shows each group apart.
 * A claim of no group is shown in the common list.
 */
export const toolGroupSchema = z.object({
  id,
  /** «Hotel Valencia Center». */
  title: text(300).min(1),
  /** The verdict in Russian: «подходит», «нет данных о шуме ночью». */
  note: text(500).nullable(),
  claim_ids: z.array(id).max(MAX_CLAIMS),
})
export type ToolGroup = z.infer<typeof toolGroupSchema>

export const toolResultSchema = z
  .object({
    status: z.enum(TOOL_STATUSES),
    /** The short result in Russian. */
    summary: text(1000),
    /** The tool's own data; the block does not show it. */
    data: z.record(z.string(), z.unknown()).nullable(),
    evidence: z.array(toolEvidenceSchema).max(MAX_EVIDENCE),
    claims: z.array(toolClaimSchema).max(MAX_CLAIMS),
    calculations: z.array(toolCalculationSchema).max(MAX_CALCULATIONS),
    /** The tool's own method; null for a tool that only reads. */
    method: toolMethodSchema.nullable(),
    limitations: z.array(text(500)).max(20),
    error: toolErrorSchema.nullable(),
    /** The characteristics by the hotel they are of; absent for a tool of one hotel. */
    groups: z.array(toolGroupSchema).max(MAX_GROUPS).optional(),
  })
  .superRefine((result, context) => {
    if ((result.status === 'error') !== (result.error !== null))
      context.addIssue({ code: 'custom', message: 'An error result has its error, and only it', path: ['error'] })
    const evidence = new Set(result.evidence.map((e) => e.id))
    const calculations = new Set(result.calculations.map((c) => c.id))
    result.claims.forEach((claim, i) => {
      if (claim.evidence_ids.some((e) => !evidence.has(e)))
        context.addIssue({ code: 'custom', message: 'A claim cites a source not in the result', path: ['claims', i] })
      if (claim.calculation_id !== null && !calculations.has(claim.calculation_id))
        context.addIssue({ code: 'custom', message: 'A claim cites an unknown calculation', path: ['claims', i] })
    })
    const claims = new Set(result.claims.map((c) => c.id))
    result.groups?.forEach((group, i) => {
      if (group.claim_ids.some((c) => !claims.has(c)))
        context.addIssue({ code: 'custom', message: 'A group names a claim not in the result', path: ['groups', i] })
    })
  })
export type ToolResult = z.infer<typeof toolResultSchema>

/** A run of a tool: its id (the row of `tool_runs` for a signed-in user) and its result. */
export const toolRunSchema = z.object({ id: z.uuid(), result: toolResultSchema })
export type ToolRun = z.infer<typeof toolRunSchema>

/** The run of a step read from an answer, a saved chat or a snapshot; anything off the contract reads as none. */
export function parseToolRun(value: unknown): ToolRun | undefined {
  const parsed = toolRunSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

/** The JSON size of a value, bytes. */
export const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length

/** A result's share of a message's 100 KB of data. */
export const MAX_RESULT_BYTES = 60_000

/** The groups with only the claims the result still has. */
const keptGroups = (result: ToolResult): Pick<ToolResult, 'groups'> => {
  if (!result.groups) return {}
  const claims = new Set(result.claims.map((c) => c.id))
  return { groups: result.groups.map((g) => ({ ...g, claim_ids: g.claim_ids.filter((c) => claims.has(c)) })) }
}

/**
 * The result within `MAX_RESULT_BYTES`: the excerpts are cut first, then the last claims go (and out of their groups),
 * then the last sources (none is cited by then). The cut is said in the limitations.
 */
export function fitResult(result: ToolResult, maxBytes = MAX_RESULT_BYTES): ToolResult {
  if (jsonBytes(result) <= maxBytes) return result
  let next: ToolResult = {
    ...result,
    data: null,
    evidence: result.evidence.map((e) => ({ ...e, excerpt: e.excerpt && e.excerpt.slice(0, 200) })),
    limitations: [...result.limitations.slice(0, 19), RESULT_CUT],
  }
  while (jsonBytes(next) > maxBytes && (next.claims.length > 0 || next.evidence.length > 0))
    next =
      next.claims.length > 0
        ? { ...next, claims: next.claims.slice(0, -1) }
        : { ...next, evidence: next.evidence.slice(0, -1) }
  return { ...next, ...keptGroups(next) }
}

export const RESULT_CUT = 'Часть данных не показана: результат слишком большой'

/** A result of a tool that failed: no sources, the error said in Russian. */
export const errorResult = (code: string, message: string, extra: Partial<ToolResult> = {}): ToolResult => ({
  status: 'error',
  summary: message,
  data: null,
  evidence: [],
  claims: [],
  calculations: [],
  method: null,
  limitations: [],
  ...extra,
  error: { code, message },
})
