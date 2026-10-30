import { matches, rank, toQuery, toVector } from './fts'
import { queryError, type QueryError, type Row } from './query'
import { DbRefusal, type Db, type Functions, type Trigger } from './store'
import { callKey } from './canonical'
import { nearPlaces, namedPlaces } from './places'

/**
 * The database's functions, triggers and row policies the standalone demo needs, in JavaScript
 * (supabase/migrations). The PostGIS functions the pages ask with a hotel's point are not computed: their answers were
 * recorded by scripts/export-standalone.ts (`recorded`); a call that was not recorded fails as the database would
 * fail, and the site says it does not know.
 */

/** A table's vectors: `dim` numbers a row, the row's `__vec` its index. */
export interface Vectors {
  dim: number
  data: Float32Array
}

export interface FunctionsSource {
  /** The recorded answer of a call by its key (`callKey`), `undefined` when none was recorded. */
  recorded?: (key: string) => unknown
  /** The vectors of a table of the snapshot. */
  vectors?: (table: string) => Vectors | null
}

type Result = { data: unknown; error: QueryError | null }
const ok = (data: unknown): Result => ({ data, error: null })
const fail = (message: string, code = 'P0001'): Result => ({ data: null, error: queryError(message, code) })

// ---------------------------------------------------------------- the policies

export function isHotelierOf(db: Db, hotelId: unknown): boolean {
  const userId = db.actor.userId
  if (!userId) return false
  const profile = db.all('hotelier_profiles').find((p) => p.user_id === userId)
  if (!profile) return false
  return (
    profile.all_hotels === true ||
    db.all('hotelier_hotel_access').some((a) => a.user_id === userId && a.hotel_id === hotelId)
  )
}

const OWN_ROWS: Record<string, string> = {
  assistant_chats: 'user_id',
  assistant_messages: 'user_id',
  assistant_chat_shares: 'user_id',
  tool_runs: 'user_id',
  tool_run_evidence: 'user_id',
  profiles: 'id',
  hotelier_profiles: 'user_id',
  rate_limit_hits: '-',
}

function visible(db: Db, table: string, row: Row): boolean {
  const userId = db.actor.userId
  const own = OWN_ROWS[table]
  if (own) return own !== '-' && userId !== null && row[own] === userId
  if (table === 'hotelier_conversations' || table === 'hotelier_requests')
    return (userId !== null && row.user_id === userId) || isHotelierOf(db, row.hotel_id)
  if (table === 'hotelier_messages') {
    const conversation = db.all('hotelier_conversations').find((c) => c.id === row.conversation_id)
    return !!conversation && visible(db, 'hotelier_conversations', conversation)
  }
  return true
}

// ---------------------------------------------------------------- the triggers

const touch: Trigger = (_db, row) => ({ ...row, updated_at: new Date().toISOString() })

const oneLine = (text: unknown, max: number) =>
  String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, max)

/** `hotelier_message_added` and `hotelier_unhide_chat`: the conversation's last message, unread counts and state. */
const messageAdded: Trigger = (db, input) => {
  const service = db.as({ userId: db.actor.userId, service: true })
  const conversation = service.all('hotelier_conversations').find((c) => c.id === input.conversation_id)
  if (!conversation) throw new DbRefusal('insert or update violates foreign key constraint', '23503')
  if (conversation.status === 'closed') throw new DbRefusal('hotelier_conversation_closed')
  const author = input.author_id
  const demoAuthor = service.all('hotelier_profiles').some((p) => p.user_id === author && p.is_demo === true)
  const row: Row = {
    ...input,
    is_demo: input.is_demo === true || demoAuthor,
    knowledge_attempts: 0,
    knowledge_due_at: input.sender === 'hotelier' && input.shareable === true ? new Date().toISOString() : null,
  }
  const sender = row.sender
  const status = conversation.status
  service.update('hotelier_conversations', [conversation], {
    last_message_at: row.created_at,
    last_message_text: oneLine(row.text, 200),
    last_sender: sender,
    is_demo: conversation.is_demo === true || row.is_demo === true,
    user_unread:
      Number(conversation.user_unread) +
      Number(sender === 'hotelier' || (sender === 'ai_assistant' && conversation.kind === 'user')),
    hotelier_unread:
      Number(conversation.hotelier_unread) +
      Number(sender === 'user' || (sender === 'ai_assistant' && conversation.kind === 'ai_request')),
    status:
      sender === 'user' && status === 'resolved'
        ? 'open'
        : sender === 'hotelier' && status === 'waiting_hotelier'
          ? 'open'
          : status,
    user_hidden_at: null,
  })
  return row
}

// ---------------------------------------------------------------- the vectors and the search

const parseVector = (value: unknown): number[] | null =>
  typeof value === 'string' ? (JSON.parse(value) as number[]) : Array.isArray(value) ? (value as number[]) : null

/** The cosine distance (`<=>`) of a row's vector to `query`; `null` without a vector. */
function distanceOf(source: FunctionsSource, table: string, row: Row, query: readonly number[], norm: number) {
  let dot = 0
  let own = 0
  const inline = parseVector(row.embedding)
  if (inline) {
    for (let i = 0; i < inline.length; i += 1) {
      dot += inline[i] * query[i]
      own += inline[i] * inline[i]
    }
  } else {
    const index = typeof row.__vec === 'number' ? row.__vec : -1
    const vectors = index >= 0 ? source.vectors?.(table) : null
    if (!vectors) return null
    const at = index * vectors.dim
    for (let i = 0; i < vectors.dim; i += 1) {
      const v = vectors.data[at + i]
      dot += v * query[i]
      own += v * v
    }
  }
  if (own === 0 || norm === 0) return null
  return 1 - dot / (Math.sqrt(own) * norm)
}

const normOf = (v: readonly number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0))

/** The vectors of the chunks' texts, computed once a text. */
const chunkVectors = new WeakMap<Row, Map<string, number[]>>()
const vectorOfChunk = (row: Row) => {
  let vector = chunkVectors.get(row)
  if (!vector) {
    vector = toVector(String(row.text ?? ''))
    chunkVectors.set(row, vector)
  }
  return vector
}

const byPlace = <T extends { id: string }>(list: T[], score: (x: T) => number, desc: boolean) =>
  list.sort((a, b) => (desc ? score(b) - score(a) : score(a) - score(b)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

/** The chunks of the hotels with their places in the full-text search and by the vector. */
function searchChunks(
  db: Db,
  source: FunctionsSource,
  hotelIds: ReadonlySet<string>,
  query: string,
  embedding: number[] | null,
  perHotel: number,
) {
  const tsq = toQuery(query.slice(0, 500))
  const norm = embedding ? normOf(embedding) : 0
  const documents = new Map<string, Row>()
  for (const d of db.rows('documents')) if (hotelIds.has(String(d.hotel_id))) documents.set(String(d.id), d)
  const own = db
    .rows('document_chunks')
    .filter((c) => documents.has(String(c.document_id)))
    .map((c) => ({ id: String(c.id), row: c, hotel: String(documents.get(String(c.document_id))!.hotel_id) }))
  const groups = new Map<string, typeof own>()
  for (const c of own) groups.set(c.hotel, [...(groups.get(c.hotel) ?? []), c])
  const fts = new Map<string, number>()
  const vec = new Map<string, { place: number; similarity: number }>()
  for (const chunks of groups.values()) {
    const found = chunks
      .filter((c) => tsq.length > 0 && matches(vectorOfChunk(c.row), tsq))
      .map((c) => ({ ...c, score: rank(vectorOfChunk(c.row), tsq) }))
    byPlace(found, (c) => c.score, true)
      .slice(0, perHotel)
      .forEach((c, i) => fts.set(c.id, i + 1))
    if (embedding) {
      const near = chunks
        .map((c) => ({ ...c, distance: distanceOf(source, 'document_chunks', c.row, embedding, norm) }))
        .filter((c): c is typeof c & { distance: number } => c.distance !== null)
      byPlace(near, (c) => c.distance, false)
        .slice(0, perHotel)
        .forEach((c, i) => vec.set(c.id, { place: i + 1, similarity: 1 - c.distance }))
    }
  }
  return { own, documents, fts, vec }
}

const chunkRow = (c: Row, d: Row) => ({
  chunk_id: c.id,
  document_id: d.id,
  evidence_id: d.evidence_id ?? null,
  kind: d.kind,
  ord: c.ord,
  text: c.text,
  metadata: c.metadata ?? {},
})

const clamp = (value: unknown, fallback: number, min: number, max: number) =>
  Math.min(Math.max(typeof value === 'number' ? Math.floor(value) : fallback, min), max)

// ---------------------------------------------------------------- the functions

type Handler = (db: Db, args: Row, source: FunctionsSource) => Result | Promise<Result>

const rateHits = new Map<string, { count: number; resetAt: number }>()

const HANDLERS: Record<string, Handler> = {
  // The counters are this instance's: the demo has no shared store, and a limit per instance still stops a flood.
  rate_limit_hit: (_db, { hit_key, hit_limit, window_seconds }) => {
    const now = Date.now()
    const key = String(hit_key)
    const hit = rateHits.get(key)
    const next =
      hit && hit.resetAt > now
        ? { ...hit, count: hit.count + 1 }
        : { count: 1, resetAt: now + Number(window_seconds) * 1000 }
    rateHits.set(key, next)
    if (rateHits.size > 10_000) for (const [k, v] of rateHits) if (v.resetAt <= now) rateHits.delete(k)
    return ok(next.count <= Number(hit_limit))
  },
  osm_place_area_add: () => ok(null),

  osm_places_near: (db, { lat, lon, radius_m, wanted, per_category }) =>
    ok(
      nearPlaces(db.rows('osm_places'), db.rows('osm_place_areas'), {
        lat: Number(lat),
        lon: Number(lon),
        radiusM: Number(radius_m),
        wanted: (wanted as string[]) ?? [],
        perCategory: clamp(per_category, 5, 1, 20),
      }),
    ),
  osm_places_named: (db, { q, max_places }) =>
    ok(namedPlaces(db.rows('osm_places'), String(q ?? ''), clamp(max_places, 5, 1, 20))),

  match_embeddings: (db, { query_embedding, match_kind, destination_ids, match_count }, source) => {
    const query = parseVector(query_embedding)
    if (!query) return fail('query_embedding is required', '22004')
    const norm = normOf(query)
    const cities = Array.isArray(destination_ids) ? new Set(destination_ids as string[]) : null
    const hits = db
      .rows('embeddings')
      .filter((e) => e.kind === match_kind && (!cities || cities.has(String(e.destination_id))))
      .map((e) => ({ e, distance: distanceOf(source, 'embeddings', e, query, norm) }))
      .filter((h): h is { e: Row; distance: number } => h.distance !== null)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, clamp(match_count, 20, 1, 100))
    return ok(
      hits.map(({ e, distance }) => ({
        ref_id: e.ref_id,
        destination_id: e.destination_id,
        content: e.content,
        similarity: 1 - distance,
      })),
    )
  },

  match_hotel_photos: (db, { query_embedding, destination_ids, match_count }, source) => {
    const query = parseVector(query_embedding)
    if (!query) return fail('query_embedding is required', '22004')
    const norm = normOf(query)
    const cities = Array.isArray(destination_ids) ? new Set(destination_ids as string[]) : null
    const nearest = db
      .rows('hotel_photo_embeddings')
      .filter((p) => !cities || cities.has(String(p.destination_id)))
      .map((p) => ({ p, distance: distanceOf(source, 'hotel_photo_embeddings', p, query, norm) }))
      .filter((h): h is { p: Row; distance: number } => h.distance !== null)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 200)
    const best = new Map<string, { hotel_id: unknown; destination_id: unknown; distance: number }>()
    for (const { p, distance } of nearest) {
      const key = `${p.hotel_id}\u0001${p.destination_id}`
      const seen = best.get(key)
      if (!seen || distance < seen.distance)
        best.set(key, { hotel_id: p.hotel_id, destination_id: p.destination_id, distance })
    }
    return ok(
      [...best.values()]
        .sort((a, b) => a.distance - b.distance || String(a.hotel_id).localeCompare(String(b.hotel_id)))
        .slice(0, clamp(match_count, 20, 1, 100))
        .map(({ hotel_id, destination_id, distance }) => ({ hotel_id, destination_id, similarity: 1 - distance })),
    )
  },

  hotel_chunks_hybrid: (db, { hotel_id, query, query_embedding, max_rows }, source) => {
    const embedding = parseVector(query_embedding)
    const { own, documents, fts, vec } = searchChunks(
      db,
      source,
      new Set([String(hotel_id)]),
      String(query ?? ''),
      embedding,
      50,
    )
    const fused = own
      .filter((c) => fts.has(c.id) || vec.has(c.id))
      .map((c) => {
        const f = fts.get(c.id) ?? null
        const v = vec.get(c.id)?.place ?? null
        return { id: c.id, c, f, v, score: (f ? 1 / (60 + f) : 0) + (v ? 1 / (60 + v) : 0) }
      })
    return ok(
      byPlace(fused, (x) => x.score, true)
        .slice(0, clamp(max_rows, 10, 1, 50))
        .map(({ c, f, v, score }) => ({
          ...chunkRow(c.row, documents.get(String(c.row.document_id))!),
          rank: score,
          fts_place: f,
          vector_place: v,
        })),
    )
  },

  hotels_chunks_search: (db, { hotel_ids, query, query_embedding, per_hotel }, source) => {
    const ids = new Set(((hotel_ids as string[]) ?? []).slice(0, 500))
    const embedding = parseVector(query_embedding)
    const n = clamp(per_hotel, 6, 1, 20)
    const { own, documents, fts, vec } = searchChunks(db, source, ids, String(query ?? ''), embedding, n)
    const rows = own
      .filter((c) => fts.has(c.id) || vec.has(c.id))
      .map((c) => ({
        hotel: c.hotel,
        id: c.id,
        place: fts.get(c.id) ?? vec.get(c.id)!.place,
        row: {
          hotel_id: c.hotel,
          ...chunkRow(c.row, documents.get(String(c.row.document_id))!),
          fts_place: fts.get(c.id) ?? null,
          vector_place: vec.get(c.id)?.place ?? null,
          similarity: vec.get(c.id)?.similarity ?? null,
        },
      }))
      .sort((a, b) => (a.hotel < b.hotel ? -1 : a.hotel > b.hotel ? 1 : a.place - b.place || (a.id < b.id ? -1 : 1)))
    return ok(rows.map((r) => r.row))
  },

  is_hotelier: (db) => ok(!!db.actor.userId && db.all('hotelier_profiles').some((p) => p.user_id === db.actor.userId)),

  hotelier_my_chats: (db) =>
    ok(
      db
        .all('hotelier_conversations')
        .filter((c) => c.user_id === db.actor.userId && c.kind === 'user' && !c.user_hidden_at)
        .sort((a, b) => Date.parse(String(b.last_message_at)) - Date.parse(String(a.last_message_at)))
        .slice(0, 200),
    ),

  hotelier_traveller_chat: (db, { hotel_id }) => {
    const newest = db
      .all('hotelier_conversations')
      .filter((c) => c.user_id === db.actor.userId && c.hotel_id === hotel_id && c.kind === 'user')
      .sort((a, b) => Date.parse(String(b.created_at)) - Date.parse(String(a.created_at)))[0]
    return ok(newest && !newest.user_hidden_at ? [newest] : [])
  },

  hotelier_hide_chat: (db, { conversation_id }) => {
    const service = db.as({ ...db.actor, service: true })
    const rows = service
      .all('hotelier_conversations')
      .filter((c) => c.id === conversation_id && c.user_id === db.actor.userId && c.kind === 'user')
    service.update('hotelier_conversations', rows, { user_hidden_at: new Date().toISOString() })
    return ok(rows.length > 0)
  },

  hotelier_conversation_read: (db, { conversation_id }) => {
    const service = db.as({ ...db.actor, service: true })
    const conversation = service.all('hotelier_conversations').find((c) => c.id === conversation_id)
    if (!conversation) return ok(null)
    const now = new Date().toISOString()
    const read = (others: (sender: unknown) => boolean, counter: 'user_unread' | 'hotelier_unread') => {
      service.update(
        'hotelier_messages',
        service
          .all('hotelier_messages')
          .filter((m) => m.conversation_id === conversation.id && others(m.sender) && !m.read_at),
        { read_at: now },
      )
      if (Number(conversation[counter]) !== 0)
        service.update('hotelier_conversations', [conversation], { [counter]: 0 })
    }
    if (conversation.user_id === db.actor.userId) read((s) => s !== 'user', 'user_unread')
    else if (isHotelierOf(db, conversation.hotel_id)) read((s) => s !== 'hotelier', 'hotelier_unread')
    return ok(null)
  },

  hotelier_conversation_status: (db, { conversation_id, status }) => {
    const service = db.as({ ...db.actor, service: true })
    const conversation = service.all('hotelier_conversations').find((c) => c.id === conversation_id)
    if (!conversation) return ok(false)
    const allowed =
      (isHotelierOf(db, conversation.hotel_id) && ['open', 'resolved', 'closed'].includes(String(status))) ||
      (conversation.user_id === db.actor.userId && status === 'closed')
    if (!allowed) return ok(false)
    service.update('hotelier_conversations', [conversation], { status })
    if (status === 'closed')
      service.update(
        'hotelier_requests',
        service.all('hotelier_requests').filter((r) => r.conversation_id === conversation.id && r.status === 'pending'),
        { status: 'cancelled' },
      )
    return ok(true)
  },

  hotelier_own_answer: (db, { message_id }) => {
    const message = db.all('hotelier_messages').find((m) => m.id === message_id)
    if (!message || message.sender !== 'hotelier' || message.author_id !== db.actor.userId) return ok(false)
    const conversation = db.all('hotelier_conversations').find((c) => c.id === message.conversation_id)
    return ok(!!conversation && isHotelierOf(db, conversation.hotel_id))
  },

  assistant_chat_share: (db, { share_id }) =>
    ok(
      db
        .all('assistant_chat_shares')
        .filter((s) => s.id === share_id)
        .map(({ id, title, snapshot, created_at }) => ({ id, title, snapshot, created_at })),
    ),

  create_hotelier_request: async (db, args) => {
    const { traveller, hotel_id, origin_chat_id, origin_tool_run_id, room_ref } = args
    const invalid = () => fail('hotelier_request_invalid')
    if (!traveller || !origin_chat_id || !origin_tool_run_id) return invalid()
    const service = db.as({ userId: String(traveller), service: true })
    const words = oneLine(args.question, Infinity)
    const keys = [
      ...new Set(
        ((args.characteristic_keys as string[]) ?? []).filter((k) => /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(k)),
      ),
    ].sort()
    const context =
      args.context_summary === null || args.context_summary === undefined ? '' : String(args.context_summary)
    if (words.length < 1 || words.length > 1000 || context.length > 1000 || keys.length > 20) return invalid()
    if (!service.all('hotels').some((h) => h.id === hotel_id)) return invalid()
    const requests = service.all('hotelier_requests')
    const run = service
      .all('tool_runs')
      .find(
        (t) =>
          t.id === origin_tool_run_id &&
          t.user_id === traveller &&
          t.chat_id === origin_chat_id &&
          t.tool_name === 'ask_hotelier' &&
          t.status === 'running' &&
          !requests.some((r) => r.origin_tool_run_id === t.id),
      )
    if (!run) return invalid()
    const text = [hotel_id, words.toLowerCase(), keys.join(','), room_ref ?? ''].join('\n')
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    const key = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const found = requests.find((r) => r.user_id === traveller && r.dedupe_key === key && r.status === 'pending')
    if (found) return ok([{ request: found.id, conversation: found.conversation_id, reused: true }])
    const hour = Date.now() - 3600_000
    const mine = requests.filter((r) => r.user_id === traveller)
    if (
      mine.filter((r) => Date.parse(String(r.created_at)) > hour).length >= 10 ||
      mine.filter((r) => r.hotel_id === hotel_id && r.status === 'pending').length >= 3
    )
      return fail('hotelier_request_limit')
    const room = room_ref
      ? service.all('entities').find((e) => e.kind === 'room' && e.ref === room_ref && e.hotel_id === hotel_id)
      : undefined
    const chat = service.insert(
      'hotelier_conversations',
      [
        {
          hotel_id,
          user_id: traveller,
          kind: 'ai_request',
          status: 'waiting_hotelier',
          origin_chat_id,
          origin_tool_run_id,
        },
      ],
      { upsert: false },
    )
    if ('error' in chat) return { data: null, error: chat.error }
    const conversation = chat.rows[0].id
    const asked = service.insert(
      'hotelier_requests',
      [
        {
          conversation_id: conversation,
          hotel_id,
          user_id: traveller,
          room_entity_id: room?.id ?? null,
          question: words,
          characteristic_keys: keys,
          context_summary: context.trim() || null,
          dedupe_key: key,
          origin_chat_id,
          origin_tool_run_id,
          expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        },
      ],
      { upsert: false },
    )
    if ('error' in asked) return { data: null, error: asked.error }
    const request = asked.rows[0].id
    const message = service.insert(
      'hotelier_messages',
      [{ conversation_id: conversation, sender: 'ai_assistant', author_id: null, text: words, request_id: request }],
      { upsert: false },
    )
    if ('error' in message) return { data: null, error: message.error }
    return ok([{ request, conversation, reused: false }])
  },

  answer_hotelier_request: (db, { request_id, message_id }) => {
    const service = db.as({ ...db.actor, service: true })
    const r = service.all('hotelier_requests').find((q) => q.id === request_id)
    if (!r || r.status !== 'pending' || !isHotelierOf(db, r.hotel_id)) return ok([])
    const m = service
      .all('hotelier_messages')
      .find((x) => x.id === message_id && x.conversation_id === r.conversation_id && x.sender === 'hotelier')
    if (!m) return ok([])
    const now = new Date().toISOString()
    service.update('hotelier_requests', [r], {
      status: 'answered',
      answered_at: now,
      answer_message_id: m.id,
      knowledge_status: m.shareable ? 'queued' : 'done',
    })
    if (m.request_id === null || m.request_id === undefined)
      service.update('hotelier_messages', [m], { request_id: r.id })
    const summary = `Отельер ответил: ${oneLine(m.text, Infinity)}`.slice(0, 1000)
    const hotel = service.all('hotels').find((h) => h.id === r.hotel_id)
    const result = {
      status: 'success',
      summary,
      data: {
        request_id: r.id,
        hotel_id: r.hotel_id,
        hotel_name: (hotel?.data as { name?: string } | undefined)?.name ?? null,
        request_status: 'answered',
        question: r.question,
        requested_characteristics: r.characteristic_keys,
        answer: String(m.text).slice(0, 4000),
        answered_at: now,
        knowledge: m.shareable ? 'queued' : 'none',
        demo: m.is_demo,
      },
      evidence: [],
      claims: [],
      calculations: [],
      method: null,
      limitations: [
        m.shareable
          ? 'Характеристики из ответа извлекаются и появятся в этом блоке'
          : 'Отельер ответил лично: ответ не попадает в общие сведения об отеле',
      ],
      error: null,
    }
    const finished: unknown[] = []
    const runs = service
      .all('tool_runs')
      .filter(
        (t) =>
          t.user_id === r.user_id &&
          t.status === 'waiting' &&
          (t.resume as { request_id?: string })?.request_id === r.id,
      )
    for (const run of runs) {
      service.update('tool_runs', [run], {
        status: 'success',
        result_summary: summary.slice(0, 4000),
        result_data: result,
        resume: null,
        completed_at: Date.parse(now) > Date.parse(String(run.started_at)) ? now : run.started_at,
        updated_at: now,
      })
      const steps = service
        .all('assistant_messages')
        .filter(
          (a) =>
            a.chat_id === run.chat_id &&
            a.user_id === r.user_id &&
            (a.data as { step?: { run?: { id?: string } } })?.step?.run?.id === run.id,
        )
      for (const a of steps) {
        const data = a.data as { step: { run: Row; result?: unknown } }
        service.update('assistant_messages', [a], {
          data: { ...data, step: { ...data.step, run: { ...data.step.run, result }, result: summary.slice(0, 300) } },
          updated_at: now,
        })
      }
      service.insert(
        'assistant_messages',
        [
          {
            chat_id: run.chat_id,
            user_id: r.user_id,
            role: 'owner',
            status: 'done',
            text: String(m.text).slice(0, 4000),
            data: { hotelierRequest: r.id, ...(m.is_demo ? { demo: true } : {}) },
          },
        ],
        { upsert: false },
      )
      const chat = service.all('assistant_chats').filter((c) => c.id === run.chat_id)
      service.update('assistant_chats', chat, { unread: true, updated_at: now })
      finished.push(run.id)
    }
    return ok(finished)
  },
}

/** The tables whose rows a function returns, for the embedded tables of its answer. */
const RETURNS: Record<string, string> = {
  hotelier_my_chats: 'hotelier_conversations',
  hotelier_traveller_chat: 'hotelier_conversations',
}

/** The functions over `source`: a recorded answer first, else the JavaScript, else «not in the snapshot». */
export function standaloneFunctions(source: FunctionsSource): Functions {
  return {
    async call(db, name, args) {
      const recorded = source.recorded?.(callKey(name, args))
      if (recorded !== undefined) return ok(recorded)
      const handler = HANDLERS[name]
      if (!handler) return fail(`standalone: ${name} was not recorded for these arguments`, 'PGRST202')
      try {
        return await handler(db, args, source)
      } catch (error) {
        if (error instanceof DbRefusal) return fail(error.message, error.code)
        console.warn(`standalone: ${name} failed (${String(error).slice(0, 200)})`)
        return fail(error instanceof Error ? error.message : String(error), 'XX000')
      }
    },
    table: (name) => RETURNS[name],
    beforeInsert: { hotelier_messages: messageAdded },
    beforeUpdate: { hotelier_profiles: touch, hotelier_conversations: touch, hotelier_requests: touch },
    visible,
  }
}
