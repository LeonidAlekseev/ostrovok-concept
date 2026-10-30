import { compare, queryError, type QueryError, type Row, type Source, type WriteResult } from './query'

/**
 * The tables of the standalone demo: the snapshot of the database (read only) under the rows one browser wrote (the
 * overlay: its chats, its messages to the hotelier, the hotelier's answers and their knowledge). A row of the overlay
 * replaces the snapshot's row with its key; `null` deletes it. The database's keys, defaults, triggers and row
 * policies the site relies on are kept here, in JavaScript.
 */

/** The rows one browser wrote: table → key → the row, or `null` for a deleted one. */
export type Overlay = Record<string, Record<string, Row | null>>

/** Who asks: the demo account (`null` for a guest) and whether the policies apply (the server's own writes skip them). */
export interface Actor {
  userId: string | null
  service: boolean
}

interface TableSchema {
  /** The primary key's columns. */
  key: string[]
  /** The values of a new row's missing columns. */
  defaults?: (row: Row, now: string, actor: Actor) => Row
}

const uuid = () => globalThis.crypto.randomUUID()

const withId = (row: Row) => (row.id === undefined || row.id === null ? { id: uuid() } : {})
const stamps = (now: string) => ({ created_at: now, updated_at: now })

/** The tables the site reads or writes, their keys and defaults (supabase/migrations). */
export const SCHEMA: Record<string, TableSchema> = {
  destinations: { key: ['id'] },
  hotels: { key: ['id'] },
  ota_hotel_pages: { key: ['master_id'] },
  ota_hotel_places: { key: ['hotel_id', 'region_id', 'type', 'name'] },
  hotel_features: { key: ['hotel_id'] },
  hotel_room_views_named: { key: ['hotel_id', 'rg_hash'] },
  entities: { key: ['id'], defaults: (row, now) => ({ ...withId(row), metadata: {}, ...stamps(now) }) },
  claims: {
    key: ['id'],
    defaults: (row, now) => ({
      ...withId(row),
      epistemic_status: 'observed',
      limitations: [],
      method: {},
      is_demo: false,
      ...stamps(now),
    }),
  },
  claim_evidence: {
    key: ['claim_id', 'evidence_id'],
    defaults: (_row, now) => ({ role: 'supports', created_at: now }),
  },
  evidence: {
    key: ['id'],
    defaults: (row, now) => ({ ...withId(row), metadata: {}, is_demo: false, retrieved_at: now, ...stamps(now) }),
  },
  calculations: { key: ['id'] },
  relations: { key: ['id'] },
  documents: {
    key: ['id'],
    defaults: (row, now) => ({ ...withId(row), language: 'ru', metadata: {}, ...stamps(now) }),
  },
  document_chunks: {
    key: ['id'],
    defaults: (row, now) => ({ ...withId(row), metadata: {}, __vec: -1, ...stamps(now) }),
  },
  embeddings: { key: ['kind', 'ref_id'] },
  hotel_photo_embeddings: { key: ['hotel_id', 'photo_key'] },
  osm_places: { key: ['osm_type', 'osm_id'] },
  osm_place_areas: { key: ['id'] },
  profiles: { key: ['id'] },
  hotelier_profiles: { key: ['user_id'] },
  hotelier_hotel_access: { key: ['user_id', 'hotel_id'] },
  assistant_chats: {
    key: ['id'],
    defaults: (row, now, actor) => ({
      ...withId(row),
      user_id: actor.userId,
      brief: null,
      question: null,
      unread: false,
      ...stamps(now),
    }),
  },
  assistant_messages: {
    key: ['id'],
    defaults: (row, now, actor) => ({ ...withId(row), user_id: actor.userId, data: {}, ...stamps(now) }),
  },
  assistant_chat_shares: {
    key: ['id'],
    defaults: (row, now, actor) => ({ ...withId(row), user_id: actor.userId, created_at: now }),
  },
  tool_runs: {
    key: ['id'],
    defaults: (row, now, actor) => ({ ...withId(row), user_id: actor.userId, started_at: now, updated_at: now }),
  },
  tool_run_evidence: { key: ['tool_run_id', 'evidence_id'] },
  hotelier_conversations: {
    key: ['id'],
    defaults: (row, now, actor) => ({
      ...withId(row),
      user_id: actor.userId,
      kind: 'user',
      status: 'open',
      origin_chat_id: null,
      origin_tool_run_id: null,
      last_message_at: now,
      last_message_text: '',
      last_sender: null,
      user_unread: 0,
      hotelier_unread: 0,
      is_demo: false,
      user_hidden_at: null,
      ...stamps(now),
    }),
  },
  hotelier_requests: {
    key: ['id'],
    defaults: (row, now, actor) => ({
      ...withId(row),
      user_id: actor.userId,
      room_entity_id: null,
      characteristic_keys: [],
      context_summary: null,
      status: 'pending',
      answer_message_id: null,
      knowledge_status: 'none',
      answered_at: null,
      ...stamps(now),
    }),
  },
  hotelier_messages: {
    key: ['id'],
    defaults: (row, now, actor) => ({
      ...withId(row),
      author_id: actor.userId,
      data: {},
      request_id: null,
      shareable: false,
      read_at: null,
      knowledge_revoked_at: null,
      is_demo: false,
      knowledge_due_at: null,
      knowledge_attempts: 0,
      created_at: now,
    }),
  },
  rate_limit_hits: { key: ['key'] },
}

const schemaOf = (table: string): TableSchema => SCHEMA[table] ?? { key: ['id'] }

export const keyOf = (table: string, row: Row) =>
  schemaOf(table)
    .key.map((c) => String(row[c] ?? ''))
    .join('\u0001')

/** A refusal of a trigger or a policy, as Postgres raises it. */
export class DbRefusal extends Error {
  readonly code: string

  constructor(message: string, code = 'P0001') {
    super(message)
    this.code = code
  }
}

/** A trigger: changes the new row before it is stored, may refuse it, may write other tables. */
export type Trigger = (db: Db, row: Row, old: Row | null) => Row

export interface Functions {
  call(db: Db, name: string, args: Row): Promise<{ data: unknown; error: QueryError | null }>
  table?(name: string): string | undefined
  /** The triggers before an insert or an update of a table. */
  beforeInsert?: Record<string, Trigger>
  beforeUpdate?: Record<string, Trigger>
  /** The rows of `table` the actor may see; every row when absent. */
  visible?: (db: Db, table: string, row: Row) => boolean
}

/** The tables of one request (the server) or one page (the browser). */
export class Db implements Source {
  /** What this request wrote, to give back to the browser. */
  readonly changes: Overlay = {}
  private merged = new Map<string, readonly Row[]>()
  private indexes = new Map<string, Map<string, Row[]>>()
  private listeners = new Set<(table: string, row: Row | null, old: Row | null) => void>()

  private readonly base: (table: string) => readonly Row[]
  readonly overlay: Overlay
  readonly functions: Functions
  readonly actor: Actor

  constructor(base: (table: string) => readonly Row[], overlay: Overlay, functions: Functions, actor: Actor) {
    this.base = base
    this.overlay = overlay
    this.functions = functions
    this.actor = actor
  }

  /** The same tables as another actor (the service role of the server's own writes). */
  as(actor: Actor): Db {
    const db = new Db(this.base, this.overlay, this.functions, actor)
    db.merged = this.merged
    db.indexes = this.indexes
    ;(db as { changes: Overlay }).changes = this.changes
    db.listeners = this.listeners
    return db
  }

  /** Every row of the table, the policies not applied. */
  all(table: string): readonly Row[] {
    const cached = this.merged.get(table)
    if (cached) return cached
    const own = this.overlay[table]
    const base = this.base(table)
    let rows: readonly Row[] = base
    if (own && Object.keys(own).length > 0) {
      const replaced = base.filter((row) => !(keyOf(table, row) in own))
      rows = [...replaced, ...Object.values(own).filter((r): r is Row => r !== null)]
    }
    this.merged.set(table, rows)
    return rows
  }

  rows(table: string): readonly Row[] {
    const all = this.all(table)
    const visible = this.functions.visible
    if (this.actor.service || !visible) return all
    return all.filter((row) => visible(this, table, row))
  }

  rowsBy(table: string, column: string, value: unknown): readonly Row[] {
    const id = `${table}.${column}`
    let index = this.indexes.get(id)
    if (!index) {
      index = new Map()
      for (const row of this.all(table)) {
        const k = String(row[column])
        const list = index.get(k)
        if (list) list.push(row)
        else index.set(k, [row])
      }
      this.indexes.set(id, index)
    }
    const rows = index.get(String(value)) ?? []
    const visible = this.functions.visible
    if (this.actor.service || !visible) return rows
    return rows.filter((row) => visible(this, table, row))
  }

  /** Called on every write of this db: the browser's live updates. */
  subscribe(listener: (table: string, row: Row | null, old: Row | null) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Forget the merged rows of a table after a write, or of all of them after the overlay changed elsewhere. */
  invalidate(table?: string) {
    if (!table) {
      this.merged.clear()
      this.indexes.clear()
      return
    }
    this.merged.delete(table)
    for (const id of [...this.indexes.keys()]) if (id.startsWith(`${table}.`)) this.indexes.delete(id)
  }

  /**
   * Stores a row as it is (no defaults, no triggers): the low level of the writes. `record: false` for a row written
   * elsewhere (the server, another tab): it is shown, not given back.
   */
  put(table: string, row: Row | null, old: Row | null, record = true) {
    const key = keyOf(table, (row ?? old)!)
    ;(this.overlay[table] ??= {})[key] = row
    if (record) (this.changes[table] ??= {})[key] = row
    this.invalidate(table)
    for (const listener of this.listeners) listener(table, row, old)
  }

  /** The rows another writer stored (`changes` of a route, the overlay of another tab), with their events. */
  apply(changes: Overlay) {
    for (const [table, rows] of Object.entries(changes)) {
      const current = this.all(table)
      for (const [key, row] of Object.entries(rows)) {
        const old = current.find((r) => keyOf(table, r) === key) ?? null
        if (row === null && old === null) {
          ;(this.overlay[table] ??= {})[key] = null
          continue
        }
        if (row && old && JSON.stringify(row) === JSON.stringify(old)) continue
        this.put(table, row, old, false)
      }
    }
  }

  private now() {
    return new Date().toISOString()
  }

  insert(
    table: string,
    input: Row[],
    { upsert, onConflict, ignoreDuplicates }: { upsert: boolean; onConflict?: string; ignoreDuplicates?: boolean },
  ): WriteResult {
    const schema = schemaOf(table)
    const conflict = onConflict ? onConflict.split(',').map((c) => c.trim()) : schema.key
    const written: Row[] = []
    try {
      for (const values of input) {
        const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined))
        const existing = conflict.every((c) => clean[c] !== undefined)
          ? this.all(table).find((row) => conflict.every((c) => equalValue(row[c], clean[c])))
          : undefined
        if (existing && !upsert) throw new DbRefusal(`duplicate key value violates unique constraint`, '23505')
        if (existing && ignoreDuplicates) continue
        if (existing) {
          written.push(this.write(table, { ...existing, ...clean }, existing))
          continue
        }
        const now = this.now()
        const row = { ...(schema.defaults?.(clean, now, this.actor) ?? {}), ...clean }
        written.push(this.write(table, row, null))
      }
    } catch (error) {
      return { error: refusalOf(error) }
    }
    return { rows: written }
  }

  update(table: string, rows: readonly Row[], patch: Row): WriteResult {
    const written: Row[] = []
    try {
      for (const old of rows) written.push(this.write(table, { ...old, ...patch }, old))
    } catch (error) {
      return { error: refusalOf(error) }
    }
    return { rows: written }
  }

  delete(table: string, rows: readonly Row[]): WriteResult {
    for (const old of rows) this.put(table, null, old)
    return { rows: [...rows] }
  }

  /** A row through the table's trigger, stored; a changed key of an update deletes the old one. */
  private write(table: string, input: Row, old: Row | null): Row {
    const trigger = old ? this.functions.beforeUpdate?.[table] : this.functions.beforeInsert?.[table]
    const row = trigger ? trigger(this, input, old) : input
    if (old && keyOf(table, old) !== keyOf(table, row)) this.put(table, null, old)
    this.put(table, row, old)
    return row
  }

  rpc(name: string, args: Row) {
    return this.functions.call(this, name, args)
  }

  rpcTable(name: string) {
    return this.functions.table?.(name)
  }
}

const equalValue = (a: unknown, b: unknown) =>
  a === b || (a !== null && b !== null && a !== undefined && b !== undefined && compare(a, b) === 0)

function refusalOf(error: unknown): QueryError {
  if (error instanceof DbRefusal) return queryError(error.message, error.code)
  return queryError(error instanceof Error ? error.message : String(error), 'XX000')
}
