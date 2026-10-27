// Writes the store of claims (src/lib/claimRows.ts) for `npm run db:features`: the natural keys of the rows become
// the ids of the database, only the new and changed rows are written and the stale ones deleted, so a second run over
// the same data writes nothing. Touches only what the script makes: the entities of the hotels and the OSM places,
// the evidence of EEA, OpenStreetMap and Островок, the calculations and claims of `noise.*`, the edges `near` and the
// documents of the reviews; what another writer adds is left alone.
import type { serviceClient } from './node.ts'

const { EEA, OSM, OSTROVOK, claimKey, entityKey, evidenceKey, sameRow } = await import('../../src/lib/claimRows.ts')
type Store = import('../../src/lib/claimRows.ts').Store

type Client = ReturnType<typeof serviceClient>
type Row = Record<string, unknown>

const PAGE = 1000
const BATCH = 200

/** Every row of the table the filter keeps, by pages in the order of `orderBy`. */
async function readAll(
  supabase: Client,
  table: string,
  columns: string,
  orderBy: string[],
  filter: (q: any) => any = (q) => q,
): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const query = orderBy.reduce((q, column) => q.order(column), filter(supabase.from(table as never).select(columns)))
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data as Row[]))
    if (data.length < PAGE) return rows
  }
}

interface Sync {
  table: string
  /** The columns of the natural key, the upsert's conflict target. */
  keys: string[]
  /** The rows there are now, of the script's part of the table only. */
  current: Row[]
  next: Row[]
  /** A column set to now on every written row: `updated_at`, and `computed_at` of a calculation. */
  stamp: string[]
  /** Columns written but not compared: the chunk's `embedding`, emptied when its text changes. */
  extra?: Row
  /** The stale rows are deleted by this column (`id`), or by their key. */
  removeBy?: string
}

interface Counts {
  table: string
  rows: number
  written: number
  deleted: number
}

/**
 * Writes the new and changed rows; the ids of the rows by their key after the write, what was done and the deletion
 * of the stale rows, left to the caller: a stale claim points at its stale calculation until both go.
 */
async function sync(
  supabase: Client,
  dryRun: boolean,
  job: Sync,
): Promise<{ ids: Map<string, string>; counts: Counts; remove: () => Promise<void> }> {
  const keyOf = (row: Row) => job.keys.map((k) => String(row[k])).join('|')
  const before = new Map(job.current.map((row) => [keyOf(row), row]))
  const after = new Set(job.next.map(keyOf))
  const upsert = job.next.filter((row) => {
    const old = before.get(keyOf(row))
    return !old || !sameRow(old, row)
  })
  const remove = job.current.filter((row) => !after.has(keyOf(row)))
  const ids = new Map(job.current.filter((row) => row.id).map((row) => [keyOf(row), String(row.id)]))
  const counts = { table: job.table, rows: job.next.length, written: upsert.length, deleted: remove.length }
  if (dryRun) {
    // Rows not written yet have no ids: those pointing at them are counted as new.
    for (const row of upsert) if (!ids.has(keyOf(row))) ids.set(keyOf(row), `new:${keyOf(row)}`)
    return { ids, counts, remove: async () => {} }
  }
  const now = new Date().toISOString()
  for (let i = 0; i < upsert.length; i += BATCH) {
    const rows = upsert
      .slice(i, i + BATCH)
      .map((row) => ({ ...row, ...job.extra, ...Object.fromEntries(job.stamp.map((c) => [c, now])) }))
    const { data, error } = await supabase
      .from(job.table as never)
      .upsert(rows as never, { onConflict: job.keys.join(',') })
      .select([...(job.removeBy === 'id' ? ['id'] : []), ...job.keys].join(', '))
    if (error) throw new Error(`${job.table}: ${error.message}`)
    for (const row of (data ?? []) as unknown as Row[]) if (row.id) ids.set(keyOf(row), String(row.id))
  }
  return {
    ids,
    counts,
    remove: () => removeRows(supabase, job.table, remove, job.removeBy ? [job.removeBy] : job.keys),
  }
}

async function removeRows(supabase: Client, table: string, rows: Row[], by: string[]) {
  if (by.length === 1) {
    const [column] = by
    for (let i = 0; i < rows.length; i += BATCH) {
      const values = rows.slice(i, i + BATCH).map((row) => row[column])
      const { error } = await supabase
        .from(table as never)
        .delete()
        .in(column, values as never)
      if (error) throw new Error(`${table}: ${error.message}`)
    }
    return
  }
  for (const row of rows) {
    const { error } = await supabase
      .from(table as never)
      .delete()
      .match(Object.fromEntries(by.map((k) => [k, row[k]])) as never)
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

/** The id of a key the rows point at; the store is built whole, so a missing one is a bug. */
const idOf = (ids: Map<string, string>, key: string, what: string) => {
  const id = ids.get(key)
  if (!id) throw new Error(`${what}: no id for ${key}`)
  return id
}

const ENTITY_COLUMNS = 'id, kind, ref, hotel_id, name'
const EVIDENCE_COLUMNS = 'id, type, title, provider, external_id, url, retrieved_at, excerpt, metadata, dataset_id'
const CALCULATION_COLUMNS = 'id, key, method, version, inputs, parameters, limitations'
const CLAIM_COLUMNS =
  'id, entity_id, property, source_key, value_numeric, value_min, value_max, value_text, value_boolean, value_json, ' +
  'unit, epistemic_status, confidence, method, calculation_id, observed_at, valid_from, valid_to, limitations'
const RELATION_COLUMNS = 'id, subject_id, predicate, object_id, claim_id, evidence_id, confidence'
const DOCUMENT_COLUMNS = 'id, kind, hotel_id, entity_id, evidence_id, language, text, metadata'
const CHUNK_COLUMNS = 'id, document_id, ord, text, metadata'

/** Writes the store and prints a line per table: rows, written, deleted. */
export async function writeClaims(supabase: Client, store: Store, dryRun: boolean): Promise<Counts[]> {
  const counts: Counts[] = []
  const removals: (() => Promise<void>)[] = []
  const run = async (job: Sync) => {
    const result = await sync(supabase, dryRun, job)
    counts.push(result.counts)
    removals.push(result.remove)
    return result.ids
  }

  // Entities by `kind|ref`, evidence by `provider|external_id`, as `entityKey`/`evidenceKey` with `|` for `:`.
  const entities = await run({
    table: 'entities',
    keys: ['kind', 'ref'],
    current: await readAll(supabase, 'entities', ENTITY_COLUMNS, ['id'], (q) => q.in('kind', ['hotel', 'osm_place'])),
    next: store.entities.map((e) => ({ kind: e.kind, ref: e.ref, hotel_id: e.hotel_id, name: e.name })),
    stamp: ['updated_at'],
    removeBy: 'id',
  })
  const entityId = (key: string) => idOf(entities, key.replace(':', '|'), 'entities')

  const evidence = await run({
    table: 'evidence',
    keys: ['provider', 'external_id'],
    current: await readAll(supabase, 'evidence', EVIDENCE_COLUMNS, ['id'], (q) =>
      q.in('provider', [EEA, OSM, OSTROVOK]).in('type', ['dataset', 'osm', 'review']),
    ),
    next: store.evidence.map((e) => ({ ...e })),
    stamp: ['updated_at'],
    removeBy: 'id',
  })
  const evidenceId = (key: string) => {
    const at = key.indexOf(':')
    return idOf(evidence, `${key.slice(0, at)}|${key.slice(at + 1)}`, 'evidence')
  }

  const calculations = await run({
    table: 'calculations',
    keys: ['key'],
    current: await readAll(supabase, 'calculations', CALCULATION_COLUMNS, ['id'], (q) => q.like('key', 'noise.%')),
    next: store.calculations.map((c) => ({ ...c })),
    stamp: ['updated_at', 'computed_at'],
    removeBy: 'id',
  })

  const claimRows = store.claims.map(({ entity, calculation, evidence: _evidence, ...claim }) => ({
    entity_id: entityId(entity),
    ...claim,
    value_boolean: null,
    value_json: null,
    calculation_id: calculation ? idOf(calculations, calculation, 'calculations') : null,
    valid_from: null,
    valid_to: null,
  }))
  const claims = await run({
    table: 'claims',
    keys: ['entity_id', 'property', 'source_key'],
    current: await readAll(supabase, 'claims', CLAIM_COLUMNS, ['id'], (q) => q.like('property', 'noise.%')),
    next: claimRows,
    stamp: ['updated_at'],
    removeBy: 'id',
  })
  const claimId = (key: string) => {
    const [entity, property, source] = key.split('|')
    return idOf(claims, `${entityId(entity)}|${property}|${source}`, 'claims')
  }

  const ownClaims = new Set(claims.values())
  const links = store.claims.flatMap((claim) =>
    claim.evidence.map((ref) => ({
      claim_id: claimId(claimKey(claim)),
      evidence_id: evidenceId(ref.evidence),
      role: ref.role,
    })),
  )
  await run({
    table: 'claim_evidence',
    keys: ['claim_id', 'evidence_id'],
    current: (
      await readAll(supabase, 'claim_evidence', 'claim_id, evidence_id, role', ['claim_id', 'evidence_id'])
    ).filter((row) => ownClaims.has(String(row.claim_id))),
    next: links,
    stamp: [],
  })

  await run({
    table: 'relations',
    keys: ['subject_id', 'predicate', 'object_id'],
    current: await readAll(supabase, 'relations', RELATION_COLUMNS, ['id'], (q) => q.eq('predicate', 'near')),
    next: store.relations.map((r) => ({
      subject_id: entityId(r.subject),
      predicate: r.predicate,
      object_id: entityId(r.object),
      claim_id: r.claim ? claimId(r.claim) : null,
      evidence_id: r.evidence ? evidenceId(r.evidence) : null,
      confidence: null,
    })),
    stamp: ['updated_at'],
    removeBy: 'id',
  })

  const documents = await run({
    table: 'documents',
    keys: ['evidence_id'],
    current: await readAll(supabase, 'documents', DOCUMENT_COLUMNS, ['id'], (q) => q.eq('kind', 'review')),
    next: store.documents.map((d) => ({
      kind: d.kind,
      hotel_id: d.hotel_id,
      entity_id: entityId(d.entity),
      evidence_id: evidenceId(d.evidence),
      language: d.language,
      text: d.text,
      metadata: d.metadata,
    })),
    stamp: ['updated_at'],
    removeBy: 'id',
  })
  const ownDocuments = new Set(documents.values())
  await run({
    table: 'document_chunks',
    keys: ['document_id', 'ord'],
    current: (await readAll(supabase, 'document_chunks', CHUNK_COLUMNS, ['id'])).filter((row) =>
      ownDocuments.has(String(row.document_id)),
    ),
    next: store.documents.flatMap((d) =>
      d.chunks.map((c) => ({
        document_id: idOf(documents, evidenceId(d.evidence), 'documents'),
        ord: c.ord,
        text: c.text,
        metadata: c.metadata,
      })),
    ),
    stamp: ['updated_at'],
    // A chunk with a new text has no vector of it yet.
    extra: { embedding: null },
    removeBy: 'id',
  })

  // The stale rows, those pointing at others first.
  for (const remove of removals.reverse()) await remove()
  for (const c of counts)
    console.log(
      `${c.table}: ${c.rows} rows, ${dryRun ? 'would write' : 'written'} ${c.written}, ${dryRun ? 'would delete' : 'deleted'} ${c.deleted}`,
    )
  return counts
}

export { claimKey, entityKey, evidenceKey }
