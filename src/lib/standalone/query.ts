/**
 * The queries of the standalone demo: the part of supabase-js's PostgREST builder the site uses (`from`, `rpc`,
 * `select` with aliases, JSON paths and embedded tables, the filters, `order`, `range`, `single`, the writes), run
 * in memory over a `Source` — the snapshot on the server, the browser's own rows in it. The site's readers and writers
 * keep their code: only the client they get changes.
 */

export type Row = Record<string, unknown>

export interface QueryError {
  message: string
  code: string
  details: string | null
  hint: string | null
}

export interface QueryResult<T = unknown> {
  data: T
  error: QueryError | null
  count: number | null
  status: number
  statusText: string
}

/** What a write gives back: the stored rows, or the refusal of a constraint or a policy. */
export type WriteResult = { rows: Row[] } | { error: QueryError }

/** Where the queries run: the rows of a table, the writes, the functions. */
export interface Source {
  rows(table: string): readonly Row[]
  /** The rows of `table` whose `column` equals `value`; an index makes the embedded tables cheap. */
  rowsBy(table: string, column: string, value: unknown): readonly Row[]
  insert(
    table: string,
    rows: Row[],
    options: { upsert: boolean; onConflict?: string; ignoreDuplicates?: boolean },
  ): WriteResult
  update(table: string, rows: readonly Row[], patch: Row): WriteResult
  delete(table: string, rows: readonly Row[]): WriteResult
  rpc(name: string, args: Row): Promise<{ data: unknown; error: QueryError | null }>
  /** The table whose rows a function returns, for the tables embedded in its answer. */
  rpcTable?(name: string): string | undefined
}

export const queryError = (message: string, code = 'PGRST000'): QueryError => ({
  message,
  code,
  details: null,
  hint: null,
})

// ---------------------------------------------------------------- the foreign keys of the schema

interface ForeignKey {
  table: string
  column: string
  ref: string
  refColumn: string
  name: string
}

const fk = (table: string, column: string, ref: string, refColumn = 'id'): ForeignKey => ({
  table,
  column,
  ref,
  refColumn,
  name: `${table}_${column}_fkey`,
})

/** The foreign keys the embedded tables of the site's selects follow. */
const FOREIGN_KEYS: ForeignKey[] = [
  fk('claims', 'calculation_id', 'calculations'),
  fk('claims', 'entity_id', 'entities'),
  fk('claim_evidence', 'claim_id', 'claims'),
  fk('claim_evidence', 'evidence_id', 'evidence'),
  fk('relations', 'subject_id', 'entities'),
  fk('relations', 'object_id', 'entities'),
  fk('relations', 'claim_id', 'claims'),
  fk('relations', 'evidence_id', 'evidence'),
  fk('hotelier_conversations', 'hotel_id', 'hotels'),
  fk('hotelier_messages', 'conversation_id', 'hotelier_conversations'),
  fk('hotelier_requests', 'conversation_id', 'hotelier_conversations'),
  fk('assistant_messages', 'chat_id', 'assistant_chats'),
  fk('tool_runs', 'chat_id', 'assistant_chats'),
  fk('tool_run_evidence', 'tool_run_id', 'tool_runs'),
  fk('tool_run_evidence', 'evidence_id', 'evidence'),
  fk('documents', 'evidence_id', 'evidence'),
  fk('document_chunks', 'document_id', 'documents'),
  fk('hotels', 'destination_id', 'destinations'),
]

interface Join {
  key: ForeignKey
  /** `true`: the embedding row holds the key (one row); `false`: the embedded rows do (a list). */
  many: boolean
}

function joinOf(table: string, target: string, hints: readonly string[]): Join | null {
  const named = (k: ForeignKey) => hints.length === 0 || hints.some((h) => h === k.name || h === k.column)
  const own = FOREIGN_KEYS.filter((k) => k.table === table && k.ref === target && named(k))
  if (own.length === 1) return { key: own[0], many: false }
  const theirs = FOREIGN_KEYS.filter((k) => k.table === target && k.ref === table && named(k))
  if (theirs.length === 1) return { key: theirs[0], many: true }
  return null
}

// ---------------------------------------------------------------- the select string

type Field =
  | { kind: 'star' }
  | { kind: 'column'; alias: string; column: string; path: { key: string; text: boolean }[] }
  | { kind: 'embed'; alias: string; table: string; hints: string[]; inner: boolean; fields: Field[] }

/** The parts of `text` split at the commas outside parentheses. */
function splitTop(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const c of text) {
    if (c === '(') depth += 1
    if (c === ')') depth -= 1
    if (c === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += c
  }
  parts.push(current)
  return parts.map((p) => p.trim()).filter(Boolean)
}

/** A column with its JSON path: `data->stars`, `data->>name`, `hotel->facts->floorsNumber`. */
function pathOf(expression: string): { column: string; path: { key: string; text: boolean }[] } {
  const clean = expression.replace(/::[a-z]+$/, '')
  const pieces = clean.split(/(->>|->)/)
  const path: { key: string; text: boolean }[] = []
  for (let i = 1; i < pieces.length; i += 2) path.push({ key: pieces[i + 1], text: pieces[i] === '->>' })
  return { column: pieces[0], path }
}

function parseSelect(text: string): Field[] {
  return splitTop(text.replace(/\s+/g, ' ')).map((item): Field => {
    if (item === '*') return { kind: 'star' }
    const open = item.indexOf('(')
    const head = open >= 0 ? item.slice(0, open) : item
    const colon = head.search(/:(?!:)/)
    const alias = colon >= 0 && head[colon + 1] !== ':' ? head.slice(0, colon).trim() : ''
    const rest = (alias ? head.slice(colon + 1) : head).trim()
    if (open >= 0) {
      const [table, ...hints] = rest.split('!')
      const inner = hints.includes('inner')
      return {
        kind: 'embed',
        alias: alias || table,
        table,
        hints: hints.filter((h) => h !== 'inner' && h !== 'left'),
        inner,
        fields: parseSelect(item.slice(open + 1, item.lastIndexOf(')'))),
      }
    }
    const { column, path } = pathOf(rest)
    return { kind: 'column', alias: alias || (path.length ? path[path.length - 1].key : column), column, path }
  })
}

const read = (row: Row, column: string, path: readonly { key: string; text: boolean }[]): unknown => {
  let value: unknown = row[column]
  for (const step of path) {
    if (value === null || value === undefined || typeof value !== 'object') return null
    value = (value as Record<string, unknown>)[step.key]
    if (value === undefined) return null
  }
  const last = path[path.length - 1]
  if (last?.text && value !== null && typeof value === 'object') return JSON.stringify(value)
  if (last?.text && value !== null && value !== undefined) return String(value)
  return value === undefined ? null : value
}

// ---------------------------------------------------------------- the filters

type Filter = { column: string; test: (value: unknown) => boolean } | { or: Filter[][] }

const ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?)?$/

/** Postgres's order of two values of one column: numbers, times and texts. */
export function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  if (typeof a === 'number' && typeof b === 'string' && b.trim() !== '' && !Number.isNaN(Number(b)))
    return a - Number(b)
  if (typeof a === 'string' && typeof b === 'string' && ISO.test(a) && ISO.test(b)) return Date.parse(a) - Date.parse(b)
  const x = String(a)
  const y = String(b)
  return x < y ? -1 : x > y ? 1 : 0
}

const equal = (a: unknown, b: unknown) =>
  a === b || (a !== null && b !== null && a !== undefined && b !== undefined && compare(a, b) === 0)

const likeTest = (pattern: string, flags: string) => {
  let source = ''
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i]
    if (c === '\\' && i + 1 < pattern.length) source += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    else if (c === '%' || c === '*') source += '.*'
    else if (c === '_') source += '.'
    else source += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  const re = new RegExp(`^${source}$`, `s${flags}`)
  return (value: unknown) => typeof value === 'string' && re.test(value)
}

/** `a` contains `b` as jsonb's and array's `@>`. */
function contains(a: unknown, b: unknown): boolean {
  if (Array.isArray(b)) return Array.isArray(a) && b.every((x) => a.some((y) => contains(y, x)))
  if (b && typeof b === 'object')
    return (
      !!a &&
      typeof a === 'object' &&
      Object.entries(b).every(([k, v]) => contains((a as Record<string, unknown>)[k], v))
    )
  return equal(a, b)
}

/** A value of a filter string (`or`, `filter`): `null`, the booleans, a list `(a,b)`, else the text. */
const literal = (text: string): unknown =>
  text === 'null' ? null : text === 'true' ? true : text === 'false' ? false : text

const listOf = (text: string) => splitTop(text.replace(/^\(|\)$/g, '')).map((v) => v.replace(/^"(.*)"$/, '$1'))

function testOf(op: string, value: unknown): (v: unknown) => boolean {
  switch (op) {
    case 'eq':
      return (v) => equal(v, value)
    case 'neq':
      return (v) => v !== null && v !== undefined && !equal(v, value)
    case 'gt':
      return (v) => v !== null && v !== undefined && compare(v, value) > 0
    case 'gte':
      return (v) => v !== null && v !== undefined && compare(v, value) >= 0
    case 'lt':
      return (v) => v !== null && v !== undefined && compare(v, value) < 0
    case 'lte':
      return (v) => v !== null && v !== undefined && compare(v, value) <= 0
    case 'like':
      return likeTest(String(value), '')
    case 'ilike':
      return likeTest(String(value), 'i')
    case 'is':
      return (v) => (value === null ? v === null || v === undefined : v === value)
    case 'in': {
      const values = Array.isArray(value) ? value : listOf(String(value))
      return (v) => values.some((x) => equal(v, x))
    }
    case 'cs':
      return (v) => contains(v, typeof value === 'string' ? parseArrayLiteral(value) : value)
    case 'ov': {
      const values = typeof value === 'string' ? parseArrayLiteral(value) : value
      return (v) => Array.isArray(v) && Array.isArray(values) && values.some((x) => v.some((y) => equal(x, y)))
    }
    default:
      throw new Error(`standalone query: the operator ${op} is not supported`)
  }
}

const parseArrayLiteral = (text: string): unknown => {
  if (text.startsWith('{')) return listOf(text.replace(/^\{|\}$/g, ''))
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** The filters of an `or` string: `a.is.null,a.gt.2026-…`, `and(…)` groups, `not.` operators. */
function parseOr(text: string): Filter[][] {
  return splitTop(text).map((part) => {
    const and = /^and\((.*)\)$/.exec(part)
    if (and) return splitTop(and[1]).map(parseCondition)
    return [parseCondition(part)]
  })
}

function parseCondition(text: string): Filter {
  const [column, ...rest] = text.split('.')
  let op = rest.shift() ?? 'eq'
  let negate = false
  if (op === 'not') {
    negate = true
    op = rest.shift() ?? 'eq'
  }
  const raw = rest.join('.')
  const test = testOf(op, op === 'in' ? raw : literal(raw))
  return { column, test: negate ? (v) => !test(v) : test }
}

// ---------------------------------------------------------------- the builder

type Op = 'select' | 'insert' | 'upsert' | 'update' | 'delete'

interface Order {
  column: string
  ascending: boolean
  nullsFirst: boolean
  table?: string
}

const ok = <T>(data: T, count: number | null = null, status = 200): QueryResult<T> => ({
  data,
  error: null,
  count,
  status,
  statusText: 'OK',
})
const failed = (error: QueryError, status = 400): QueryResult<null> => ({
  data: null,
  error,
  count: null,
  status,
  statusText: 'Error',
})

/** A query of a table or a function's answer, run when awaited. */
export class Query<T = any> implements PromiseLike<QueryResult<T>> {
  private op: Op = 'select'
  private fields: Field[] | null = null
  private returning = false
  private filters: Filter[] = []
  private embedFilters = new Map<string, Filter[]>()
  private orders: Order[] = []
  private from?: number
  private to?: number
  private embedLimits = new Map<string, number>()
  private mode: 'many' | 'single' | 'maybe' = 'many'
  private payload: Row[] = []
  private patch: Row = {}
  private upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {}
  private countMode = false
  private headOnly = false
  private signal?: AbortSignal

  private readonly source: Source
  private readonly table: string
  private readonly call?: { name: string; args: Row }

  constructor(source: Source, table: string, call?: { name: string; args: Row }) {
    this.source = source
    this.table = table
    this.call = call
  }

  select(columns = '*', options?: { count?: string; head?: boolean }) {
    this.fields = parseSelect(columns)
    if (this.op !== 'select') this.returning = true
    if (options?.count) this.countMode = true
    if (options?.head) this.headOnly = true
    return this
  }

  insert(values: Row | Row[], _options?: unknown) {
    this.op = 'insert'
    this.payload = Array.isArray(values) ? values : [values]
    return this
  }

  upsert(values: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = 'upsert'
    this.payload = Array.isArray(values) ? values : [values]
    this.upsertOptions = options
    return this
  }

  update(patch: Row, _options?: unknown) {
    this.op = 'update'
    this.patch = patch
    return this
  }

  delete(_options?: unknown) {
    this.op = 'delete'
    return this
  }

  private add(column: string, test: (v: unknown) => boolean) {
    const dot = column.indexOf('.')
    if (dot > 0 && !column.includes('->')) {
      const embed = column.slice(0, dot)
      const list = this.embedFilters.get(embed) ?? []
      list.push({ column: column.slice(dot + 1), test })
      this.embedFilters.set(embed, list)
    } else this.filters.push({ column, test })
    return this
  }

  eq(column: string, value: unknown) {
    return this.add(column, testOf('eq', value))
  }
  neq(column: string, value: unknown) {
    return this.add(column, testOf('neq', value))
  }
  gt(column: string, value: unknown) {
    return this.add(column, testOf('gt', value))
  }
  gte(column: string, value: unknown) {
    return this.add(column, testOf('gte', value))
  }
  lt(column: string, value: unknown) {
    return this.add(column, testOf('lt', value))
  }
  lte(column: string, value: unknown) {
    return this.add(column, testOf('lte', value))
  }
  like(column: string, pattern: string) {
    return this.add(column, testOf('like', pattern))
  }
  ilike(column: string, pattern: string) {
    return this.add(column, testOf('ilike', pattern))
  }
  is(column: string, value: unknown) {
    return this.add(column, testOf('is', value))
  }
  in(column: string, values: readonly unknown[]) {
    return this.add(column, testOf('in', [...values]))
  }
  contains(column: string, value: unknown) {
    return this.add(column, testOf('cs', value))
  }
  overlaps(column: string, value: unknown) {
    return this.add(column, testOf('ov', value))
  }
  match(values: Row) {
    for (const [column, value] of Object.entries(values)) this.eq(column, value)
    return this
  }
  not(column: string, op: string, value: unknown) {
    const test = testOf(op, value)
    return this.add(column, (v) => !test(v))
  }
  filter(column: string, op: string, value: unknown) {
    if (op.startsWith('not.')) return this.not(column, op.slice(4), value)
    return this.add(column, testOf(op, op === 'in' ? value : typeof value === 'string' ? literal(value) : value))
  }
  or(text: string, options?: { referencedTable?: string; foreignTable?: string }) {
    const embed = options?.referencedTable ?? options?.foreignTable
    const filter: Filter = { or: parseOr(text) }
    if (embed) {
      const list = this.embedFilters.get(embed) ?? []
      list.push(filter)
      this.embedFilters.set(embed, list)
    } else this.filters.push(filter)
    return this
  }

  order(
    column: string,
    options: { ascending?: boolean; nullsFirst?: boolean; referencedTable?: string; foreignTable?: string } = {},
  ) {
    const ascending = options.ascending ?? true
    this.orders.push({
      column,
      ascending,
      nullsFirst: options.nullsFirst ?? !ascending,
      table: options.referencedTable ?? options.foreignTable,
    })
    return this
  }

  limit(count: number, options?: { referencedTable?: string; foreignTable?: string }) {
    const embed = options?.referencedTable ?? options?.foreignTable
    if (embed) this.embedLimits.set(embed, count)
    else {
      this.from = this.from ?? 0
      this.to = this.from + count - 1
    }
    return this
  }

  range(from: number, to: number) {
    this.from = from
    this.to = to
    return this
  }

  single() {
    this.mode = 'single'
    return this as unknown as Query<any>
  }

  maybeSingle() {
    this.mode = 'maybe'
    return this as unknown as Query<any>
  }

  abortSignal(signal: AbortSignal) {
    this.signal = signal
    return this
  }

  returns<U>() {
    return this as unknown as Query<U>
  }

  overrideTypes<U>() {
    return this as unknown as Query<U>
  }

  throwOnError() {
    return this
  }

  then<A = QueryResult<T>, B = never>(
    resolve?: ((value: QueryResult<T>) => A | PromiseLike<A>) | null,
    reject?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(resolve as never, reject)
  }

  private matches(row: Row, filters: readonly Filter[]): boolean {
    return filters.every((f) =>
      'or' in f ? f.or.some((group) => this.matches(row, group)) : f.test(readColumn(row, f.column)),
    )
  }

  private async run(): Promise<QueryResult<any>> {
    if (this.signal?.aborted) return failed(queryError('The operation was aborted', '20'))
    try {
      if (this.call) return await this.runCall()
      const all = this.source.rows(this.table)
      if (this.op === 'insert' || this.op === 'upsert') {
        const written = this.source.insert(this.table, this.payload, {
          upsert: this.op === 'upsert',
          ...this.upsertOptions,
        })
        return this.finishWrite(written, 201)
      }
      const selected = all.filter((row) => this.matches(row, this.filters))
      if (this.op === 'update') return this.finishWrite(this.source.update(this.table, selected, this.patch), 200)
      if (this.op === 'delete') return this.finishWrite(this.source.delete(this.table, selected), 200)
      return this.shape(this.table, selected)
    } catch (error) {
      return failed(queryError(error instanceof Error ? error.message : String(error), 'XX000'), 500)
    }
  }

  private async runCall(): Promise<QueryResult<any>> {
    const { name, args } = this.call!
    const { data, error } = await this.source.rpc(name, args)
    if (error) return failed(error, error.code === '42501' ? 403 : 400)
    if (!Array.isArray(data)) return ok(data)
    // A function of scalars (`setof text`) has no columns to select or filter: its list as it is, paged.
    if (!data.every((row) => row && typeof row === 'object')) {
      const page = this.from === undefined ? data : data.slice(this.from, (this.to ?? data.length - 1) + 1)
      return ok(page)
    }
    const rows = (data as Row[]).filter((row) => this.matches(row, this.filters))
    const table = this.source.rpcTable?.(name) ?? name
    return this.shape(table, rows)
  }

  private finishWrite(result: WriteResult, status: number): QueryResult<any> {
    if ('error' in result) return failed(result.error, result.error.code === '42501' ? 403 : 409)
    if (!this.returning) return ok(null, null, status)
    return this.shape(this.table, result.rows, status)
  }

  /** The rows ordered, paged, embedded and cut to the select's fields, as one row, none or the list. */
  private shape(table: string, input: readonly Row[], status = 200): QueryResult<any> {
    let rows = [...input]
    const fields = this.fields ?? [{ kind: 'star' } as Field]
    // An inner embedded table drops the rows without a match before the order and the page.
    let shaped = rows.map((row) => ({ row, out: this.project(table, row, fields) }))
    shaped = shaped.filter((s) => s.out !== null)
    const own = this.orders.filter((o) => !o.table)
    if (own.length) shaped.sort((a, b) => orderRows(a.row, b.row, own))
    const count = shaped.length
    if (this.from !== undefined) shaped = shaped.slice(this.from, (this.to ?? shaped.length - 1) + 1)
    rows = shaped.map((s) => s.out as Row)
    if (this.headOnly) return ok(null, count, status)
    if (this.mode === 'single') {
      if (rows.length !== 1)
        return failed(queryError(`JSON object requested, multiple (or no) rows returned`, 'PGRST116'), 406)
      return ok(rows[0], this.countMode ? count : null, status)
    }
    if (this.mode === 'maybe') {
      if (rows.length > 1) return failed(queryError('JSON object requested, multiple rows returned', 'PGRST116'), 406)
      return ok(rows[0] ?? null, this.countMode ? count : null, status)
    }
    return ok(rows, this.countMode ? count : null, status)
  }

  /** The row cut to `fields`; `null` when an inner embedded table has no match. */
  private project(table: string, row: Row, fields: readonly Field[], embedPath = ''): Row | null {
    const out: Row = {}
    for (const field of fields) {
      if (field.kind === 'star') {
        for (const [k, v] of Object.entries(row)) if (!k.startsWith('__')) out[k] = v
      } else if (field.kind === 'column') {
        out[field.alias] = read(row, field.column, field.path)
      } else {
        const join = joinOf(table, field.table, field.hints)
        if (!join) throw new Error(`standalone query: no relation ${table} -> ${field.table}`)
        const key = embedPath ? `${embedPath}.${field.alias}` : field.alias
        const filters = [...(this.embedFilters.get(field.alias) ?? []), ...(this.embedFilters.get(field.table) ?? [])]
        const candidates = join.many
          ? this.source.rowsBy(field.table, join.key.column, row[join.key.refColumn])
          : row[join.key.column] === null || row[join.key.column] === undefined
            ? []
            : this.source.rowsBy(field.table, join.key.refColumn, row[join.key.column])
        let embedded = candidates
          .filter((r) => this.matches(r, filters))
          .map((r) => ({ r, o: this.project(field.table, r, field.fields, key) }))
          .filter((x) => x.o !== null)
        const orders = this.orders.filter((o) => o.table === field.alias || o.table === field.table)
        if (orders.length) embedded = embedded.sort((a, b) => orderRows(a.r, b.r, orders))
        const limit = this.embedLimits.get(field.alias) ?? this.embedLimits.get(field.table)
        if (limit !== undefined) embedded = embedded.slice(0, limit)
        if (field.inner && embedded.length === 0) return null
        // A filter on a left-joined embedded table empties it, it does not drop the row (PostgREST's behaviour).
        out[field.alias] = join.many ? embedded.map((x) => x.o) : (embedded[0]?.o ?? null)
      }
    }
    return out
  }
}

/** A column of a row, with its JSON path when it has one (`data->>name`). */
function readColumn(row: Row, column: string): unknown {
  if (!column.includes('->')) return row[column] === undefined ? null : row[column]
  const { column: name, path } = pathOf(column)
  return read(row, name, path)
}

function orderRows(a: Row, b: Row, orders: readonly Order[]): number {
  for (const o of orders) {
    const x = readColumn(a, o.column)
    const y = readColumn(b, o.column)
    const xNull = x === null || x === undefined
    const yNull = y === null || y === undefined
    if (xNull || yNull) {
      if (xNull && yNull) continue
      return xNull === o.nullsFirst ? -1 : 1
    }
    const c = compare(x, y)
    if (c !== 0) return o.ascending ? c : -c
  }
  return 0
}

/** The client's `from` and `rpc` over a source. */
export function queryClient(source: Source) {
  return {
    from: (table: string) => new Query(source, table),
    rpc: (name: string, args: Row = {}, _options?: unknown) => new Query(source, name, { name, args }),
  }
}
