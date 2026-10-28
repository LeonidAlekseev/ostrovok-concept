import 'server-only'
import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { embedMany } from 'ai'
import { CONFIDENCE_POLICY, confidenceFor } from '../confidence'
import { contentHash, embeddingModel, toVector } from '../ai/embedding'
import { extractHotelierFacts, type HotelierFact } from '../ai/hotelierExtract'
import { getTextModels } from '../ai/model'
import { NVIDIA_KEY } from '../ai/nvidia'
import { characteristicLabel, hotelierProperty } from '../hotelierFacts'
import { getSecret } from '../secrets'
import { isSupabaseConfigured, supabaseUrl } from '../supabase/config'
import { parseToolRun, toolResultSchema, type ToolClaim, type ToolEvidence, type ToolResult } from '../toolResult'
import type { Database, Json } from './database.types'

/**
 * The hotel's knowledge from its hotelier's answers (hotelier-knowledge), written by the server after the answer:
 * `after()` of the route, then — for a try that failed or was cut off — again by itself after the responses of the
 * routes that read the knowledge (`retryDueHotelierKnowledge`), with `npm run db:hotelier-knowledge` left for the
 * operator. It has the service role, which the store of claims needs — no browser, no request of a user reaches it. Only an answer the
 * hotelier marked shareable becomes knowledge, and only its impersonal facts: the conversation itself stays private.
 * Each fact is a claim `reported` of the hotel (or its room) with the policy's confidence of an owner's answer
 * (`owner_answer`, 0.75) and the answer as its evidence; a later answer of the same characteristic ends the older claim
 * (`valid_to`) instead of overwriting it, a withdrawn answer ends its claims. The facts are a document of the hotel's
 * knowledge, its chunks with the vectors of the search (embedded again only when their text changed). The runs of
 * Эвал that waited for the answer get the facts and their source. Failures are logged by their code, never the text.
 */

type Service = SupabaseClient<Database>

export const HOTELIER_PROVIDER = 'Отельер'
const HOTELIER_SOURCE = 'hotelier:'
const SUPERSEDED = 'Заменено более поздним ответом отельера'
const CONFLICT = 'Противоречит другому ответу отельера: уточняется'
const REVOKED = 'Отозвано отельером'
const REPORTED = 'Сообщено отельером, сервис это не проверял'
/** The line of a run whose answer's characteristics are on their way (`answer_hotelier_request`). */
const EXTRACTING = 'Характеристики из ответа извлекаются'
const NOT_EXTRACTED = 'Характеристики из ответа не удалось сохранить: ответ отельера — выше'
const REVOKED_RUN = 'Отельер отозвал сведения из этого ответа: Эвал их больше не использует'

/**
 * An answer's knowledge is taken for this long (`knowledge_due_at`): longer than a function may run after its response
 * (`maxDuration`), so a worker cut off by it leaves the answer due again instead of waiting for a person.
 */
const LEASE_MS = 10 * 60_000
/** The tries of an answer's knowledge at most; then the request is `failed` until `npm run db:hotelier-knowledge`. */
export const MAX_KNOWLEDGE_ATTEMPTS = 5
/** The pause after the failed try `attempt` (1, 2, …): 1, 4, 16, 64 minutes. */
export const retryDelayMs = (attempt: number) => 60_000 * 4 ** (attempt - 1)
/** A server instance looks for due answers at most this often: after the responses of the routes that read them. */
const SWEEP_EVERY_MS = 60_000

let service: Promise<Service | null> | undefined

/** The client with the service role; `null` without Supabase or the key. */
export function serviceClient(): Promise<Service | null> {
  service ??= (async () => {
    const key = isSupabaseConfigured ? await getSecret('SUPABASE_SERVICE_ROLE_KEY').catch(() => undefined) : undefined
    return key
      ? createClient<Database>(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } })
      : null
  })()
  return service
}

const warn = (what: string, error: unknown) =>
  console.warn(`hotelier knowledge: ${what} (${String((error as { code?: unknown })?.code ?? 'error').slice(0, 40)})`)

/** The rows of a read or write; throws the database's error (the caller logs its code) or a missing row. */
function must<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error
  if (result.data === null || result.data === undefined) throw { code: 'no_row' }
  return result.data
}

/** A write that returns nothing; throws the database's error. */
function done(result: { error: unknown }) {
  if (result.error) throw result.error
}

/** The row of a read that may find none. */
function maybe<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error
  return result.data
}

interface Answer {
  message: Database['public']['Tables']['hotelier_messages']['Row']
  hotelId: string
  hotelName: string
  request: Database['public']['Tables']['hotelier_requests']['Row'] | null
  demo: boolean
}

async function readAnswer(db: Service, messageId: string): Promise<Answer | null> {
  const message = maybe(await db.from('hotelier_messages').select('*').eq('id', messageId).maybeSingle())
  if (!message || message.sender !== 'hotelier') return null
  const conversation = must(
    await db.from('hotelier_conversations').select('hotel_id').eq('id', message.conversation_id).single(),
  )
  const [hotel, request, profile] = await Promise.all([
    db.from('hotels').select('id, name:data->>name').eq('id', conversation.hotel_id).single(),
    message.request_id
      ? db.from('hotelier_requests').select('*').eq('id', message.request_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    message.author_id
      ? db.from('hotelier_profiles').select('is_demo').eq('user_id', message.author_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  const name = (must(hotel) as { name?: unknown }).name
  return {
    message,
    hotelId: conversation.hotel_id,
    hotelName: typeof name === 'string' && name ? name : conversation.hotel_id,
    request: maybe(request),
    demo: maybe(profile)?.is_demo === true,
  }
}

/** The entity of the hotel, made when the store has none yet. */
async function hotelEntity(db: Service, hotelId: string): Promise<string> {
  const row = must(
    await db
      .from('entities')
      .upsert({ kind: 'hotel', ref: hotelId, hotel_id: hotelId }, { onConflict: 'kind,ref' })
      .select('id')
      .single(),
  )
  return row.id
}

/** The claim's value: a plain yes or no is a boolean, anything else the hotelier's words. */
const valueOf = (fact: HotelierFact) =>
  fact.yes !== null && /^(?:да|нет|есть|нету?)$/iu.test(fact.value)
    ? { value_boolean: fact.yes }
    : { value_text: fact.value }

/**
 * The words of a fact for the hotel's knowledge and the search, built from the characteristic itself — not the model's
 * sentence, which may blur two facts into one: «Со слов отельера, номера Deluxe: сторона окон — на запад.»
 */
export function factText(fact: HotelierFact): string {
  const label = characteristicLabel(fact.key).toLocaleLowerCase('ru')
  return `Со слов отельера${fact.room ? `, номера ${fact.room}` : ''}: ${label} — ${fact.value}.`
}

interface Written {
  evidenceId: string
  claims: ToolClaim[]
  evidence: ToolEvidence
}

/** The answer's evidence, its claims (ending the older ones of the same characteristic) and its document. */
async function writeFacts(
  db: Service,
  answer: Answer,
  facts: readonly HotelierFact[],
  model: string,
  { conflict = false }: { conflict?: boolean } = {},
): Promise<Written> {
  const { message, hotelId, request, demo } = answer
  const observedAt = message.created_at
  const excerpt = facts.map(factText).join(' ').slice(0, 2000)
  const evidence = must(
    await db
      .from('evidence')
      .upsert(
        {
          type: 'hotelier',
          title: request ? `Ответ отельера на вопрос: ${request.question.slice(0, 200)}` : 'Ответ отельера',
          provider: HOTELIER_PROVIDER,
          external_id: message.id,
          retrieved_at: observedAt,
          excerpt,
          metadata: { request_id: request?.id ?? null, policy: CONFIDENCE_POLICY },
          is_demo: demo,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider,external_id' },
      )
      .select('id')
      .single(),
  )
  const hotel = await hotelEntity(db, hotelId)
  const entity = request?.room_entity_id ?? hotel
  const sourceKey = `${HOTELIER_SOURCE}${message.id}`
  const { confidence, method } = confidenceFor('owner_answer')
  const claims: ToolClaim[] = []
  for (const fact of facts) {
    const property = hotelierProperty(fact.key)
    const room = fact.room ? `:${fact.room.toLocaleLowerCase('ru')}` : ''
    const claim = must(
      await db
        .from('claims')
        .upsert(
          {
            entity_id: entity,
            property,
            source_key: `${sourceKey}${room}`,
            ...valueOf(fact),
            epistemic_status: 'reported',
            confidence,
            method: {
              ...method,
              extractor: model,
              message_id: message.id,
              request_id: request?.id ?? null,
              ...(fact.room && { room: fact.room }),
              statement: fact.statement,
            },
            observed_at: observedAt,
            limitations: [REPORTED],
            is_demo: demo,
            valid_to: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'entity_id,property,source_key' },
        )
        .select('id')
        .single(),
    )
    done(
      await db
        .from('claim_evidence')
        .upsert(
          { claim_id: claim.id, evidence_id: evidence.id, role: 'source' },
          { onConflict: 'claim_id,evidence_id' },
        ),
    )
    // The older answers of the same characteristic (and room) end; their rows and sources stay. An answer that
    // contradicts them without replacing them (`conflict`) leaves both standing, each marked, until it is cleared up.
    const older = must(
      await db
        .from('claims')
        .select('id, limitations, source_key, observed_at')
        .eq('entity_id', entity)
        .eq('property', property)
        .like('source_key', `${HOTELIER_SOURCE}%`)
        .neq('source_key', `${sourceKey}${room}`)
        .is('valid_to', null),
    ).filter((c) => (room ? c.source_key.endsWith(room) : !c.source_key.slice(HOTELIER_SOURCE.length).includes(':')))
    // An answer older than one already stored (an answer processed late) ends itself, not the newer one.
    const newer = older.filter((c) => c.observed_at !== null && c.observed_at > observedAt)
    if (newer.length > 0 && !conflict) {
      done(
        await db
          .from('claims')
          .update({ valid_to: newer[0].observed_at, limitations: [REPORTED, SUPERSEDED] })
          .eq('id', claim.id),
      )
      older.splice(0, older.length)
    }
    for (const old of older.filter((c) => !(c.observed_at !== null && c.observed_at > observedAt)))
      done(
        await db
          .from('claims')
          .update(
            conflict
              ? { limitations: [...new Set([...old.limitations, CONFLICT])] }
              : { valid_to: observedAt, limitations: [...new Set([...old.limitations, SUPERSEDED])] },
          )
          .eq('id', old.id),
      )
    if (conflict && older.length > 0)
      done(
        await db
          .from('claims')
          .update({ limitations: [REPORTED, CONFLICT] })
          .eq('id', claim.id),
      )
    claims.push({
      id: claim.id,
      label: `${characteristicLabel(fact.key)}${fact.room ? ` (${fact.room})` : ''}`,
      value: fact.value,
      status: 'reported',
      confidence,
      evidence_ids: [evidence.id],
      calculation_id: null,
      ...(demo && { demo: true }),
    })
  }
  await writeDocument(db, answer, evidence.id, hotel, facts)
  await retireDocuments(db, hotelId)
  return {
    evidenceId: evidence.id,
    claims,
    evidence: {
      id: evidence.id,
      source_type: 'hotelier',
      source_name: HOTELIER_PROVIDER,
      source_id: null,
      source_url: null,
      title: request ? `Ответ отельера на вопрос: ${request.question.slice(0, 200)}` : 'Ответ отельера',
      excerpt: excerpt.slice(0, 1000),
      retrieved_at: observedAt,
      entity_id: entity,
      claim_id: null,
      ...(demo && { demo: true }),
    },
  }
}

/** The answer's document of the hotel's knowledge: a chunk a fact, embedded only when its text changed. */
async function writeDocument(
  db: Service,
  { hotelId, message, request, demo }: Answer,
  evidenceId: string,
  entityId: string,
  facts: readonly HotelierFact[],
) {
  const document = must(
    await db
      .from('documents')
      .upsert(
        {
          kind: 'hotelier_answer',
          hotel_id: hotelId,
          entity_id: entityId,
          evidence_id: evidenceId,
          language: 'ru',
          text: facts.map(factText).join('\n'),
          metadata: { message_id: message.id, request_id: request?.id ?? null, demo },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'evidence_id' },
      )
      .select('id')
      .single(),
  )
  const old = must(await db.from('document_chunks').select('ord, content_hash').eq('document_id', document.id)) as {
    ord: number
    content_hash: string | null
  }[]
  const hashes = new Map(old.map((c) => [c.ord, c.content_hash]))
  const chunks = facts.map((fact, ord) => ({
    ord,
    text: factText(fact),
    hash: contentHash(factText(fact)),
    metadata: { key: fact.key, room: fact.room, demo },
  }))
  const changed = chunks.filter((c) => hashes.get(c.ord) !== c.hash)
  const vectors = await embedPassages(changed.map((c) => c.text))
  if (changed.length > 0)
    done(
      await db.from('document_chunks').upsert(
        changed.map((c, i) => ({
          document_id: document.id,
          ord: c.ord,
          text: c.text,
          metadata: c.metadata,
          // Without the model the chunk is found by its words, and embedded on the next run.
          embedding: vectors?.[i] ? toVector(vectors[i]) : null,
          content_hash: vectors?.[i] ? c.hash : null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'document_id,ord' },
      ),
    )
  if (old.length > chunks.length)
    done(await db.from('document_chunks').delete().eq('document_id', document.id).gte('ord', chunks.length))
}

/** The vectors of the texts, as passages; `null` without the key or when the model failed. */
async function embedPassages(texts: readonly string[]): Promise<number[][] | null> {
  if (texts.length === 0) return []
  const key = await getSecret(NVIDIA_KEY).catch(() => undefined)
  if (!key) return null
  try {
    const { embeddings } = await embedMany({
      model: embeddingModel(key, 'passage'),
      values: [...texts],
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(20_000),
    })
    return embeddings
  } catch (error) {
    warn('not embedded', error)
    return null
  }
}

/** The documents of the hotel's hotelier answers none of whose claims holds any more leave the search. */
async function retireDocuments(db: Service, hotelId: string) {
  const documents = must(
    await db.from('documents').select('id, evidence_id').eq('hotel_id', hotelId).eq('kind', 'hotelier_answer'),
  )
  for (const doc of documents) {
    const live = must(
      await db
        .from('claim_evidence')
        .select('claim_id, claims!inner(valid_to)')
        .eq('evidence_id', doc.evidence_id)
        .is('claims.valid_to', null)
        .limit(1),
    )
    if (live.length === 0) done(await db.from('documents').delete().eq('id', doc.id))
  }
}

/** The runs of Эвал that waited for the request: its facts and their source join the result in place. */
function finishRuns(db: Service, requestId: string, written: Written | null, limitation: string) {
  return updateRuns(
    db,
    requestId,
    (before) => ({
      ...before,
      data: { ...before.data, knowledge: written ? 'done' : 'none' },
      evidence: written ? [written.evidence] : before.evidence,
      claims: written ? written.claims : before.claims,
      limitations: [...before.limitations.filter((line) => !line.startsWith(EXTRACTING)), limitation].slice(0, 20),
    }),
    written?.evidenceId,
  )
}

/**
 * The runs of Эвал of the request, each result changed in place — in `tool_runs` and in the step of the chat's message
 * that shows it, so the block «Запрос отельеру» shows the change at once (Realtime) and after a reload.
 */
async function updateRuns(
  db: Service,
  requestId: string,
  change: (before: ToolResult) => ToolResult,
  evidenceId?: string,
) {
  const runs = must(
    await db
      .from('tool_runs')
      .select('id, chat_id, user_id, result_data')
      .eq('tool_name', 'ask_hotelier')
      .eq('result_data->data->>request_id', requestId),
  )
  for (const run of runs) {
    const parsed = toolResultSchema.safeParse(run.result_data)
    if (!parsed.success) continue
    const result = change(parsed.data)
    done(
      await db
        .from('tool_runs')
        .update({ result_data: result as unknown as Json, updated_at: new Date().toISOString() })
        .eq('id', run.id),
    )
    if (evidenceId)
      await db
        .from('tool_run_evidence')
        .upsert(
          { tool_run_id: run.id, user_id: run.user_id, evidence_id: evidenceId },
          { onConflict: 'tool_run_id,evidence_id' },
        )
    // The step of the chat's message shows the same result after a reload.
    const messages = must(
      await db
        .from('assistant_messages')
        .select('id, data')
        .eq('chat_id', run.chat_id)
        .eq('user_id', run.user_id)
        .eq('data->step->run->>id', run.id),
    )
    for (const message of messages) {
      const data = (message.data ?? {}) as { step?: { run?: unknown } }
      if (!parseToolRun(data.step?.run)) continue
      done(
        await db
          .from('assistant_messages')
          .update({
            data: { ...data, step: { ...data.step, run: { id: run.id, result } } } as unknown as NonNullable<Json>,
            updated_at: new Date().toISOString(),
          })
          .eq('id', message.id),
      )
    }
  }
}

/**
 * The facts given for a hotelier's answer, written as an extracted answer's are — the claims, their source, the
 * document of the search with its vectors, the waiting runs — without a model: the demo data
 * (`npm run db:seed:hotelier-demo`) know their facts. `conflict`: the answer contradicts the hotelier's earlier one
 * and both stand. `null` when the message is not a hotelier's shareable answer.
 */
export async function writeHotelierFacts(
  messageId: string,
  facts: readonly HotelierFact[],
  { model, conflict = false }: { model: string; conflict?: boolean },
) {
  const db = await serviceClient()
  if (!db) throw new Error('hotelier knowledge: no service role key')
  const answer = await readAnswer(db, messageId)
  if (!answer || !answer.message.shareable) return null
  // The demo data know the facts of their answers: none is left for the extraction.
  if (facts.length === 0) {
    await settle(db, messageId)
    return null
  }
  const written = await writeFacts(db, answer, facts, model, { conflict })
  if (answer.request) {
    await finishRuns(db, answer.request.id, written, REPORTED)
    await setKnowledge(db, answer.request.id, 'done')
  }
  await settle(db, messageId)
  return written
}

/**
 * Takes the answer's knowledge for this worker, for a lease: it is due (or `force`: the operator's re-run) and nobody
 * took it since it was read — the try counts compare (`knowledge_attempts`), so of two workers one wins. The try's
 * number; `null` when there is nothing to take.
 */
async function claimKnowledge(db: Service, messageId: string, force: boolean): Promise<number | null> {
  const row = maybe(
    await db.from('hotelier_messages').select('knowledge_attempts, knowledge_due_at').eq('id', messageId).maybeSingle(),
  )
  const now = Date.now()
  if (!row || (!force && (!row.knowledge_due_at || Date.parse(row.knowledge_due_at) > now))) return null
  const attempt = row.knowledge_attempts + 1
  const claimed = must(
    await db
      .from('hotelier_messages')
      .update({ knowledge_attempts: attempt, knowledge_due_at: new Date(now + LEASE_MS).toISOString() })
      .eq('id', messageId)
      .eq('knowledge_attempts', row.knowledge_attempts)
      .select('id'),
  )
  return claimed.length > 0 ? attempt : null
}

/** The answer's knowledge is settled: nothing is due any more. */
async function settle(db: Service, messageId: string) {
  done(await db.from('hotelier_messages').update({ knowledge_due_at: null }).eq('id', messageId))
}

/**
 * The knowledge of a hotelier's shareable answer, once it is due (`knowledge_due_at`, from the moment it was written):
 * its facts, the waiting runs with them, the request's `knowledge_status`. The answer is taken for a lease first, so
 * two workers never extract it twice and one cut off by `maxDuration` leaves it due again; a failed try is due again
 * after a pause (`retryDelayMs`), the request still `queued`; after `MAX_KNOWLEDGE_ATTEMPTS` the request is `failed`,
 * its runs say so, and only `force` (the operator's `npm run db:hotelier-knowledge`) tries it again. Idempotent: an
 * answer done again is rewritten in place. `skipped` when it is not due or another worker has it. Never throws.
 */
export async function processHotelierAnswer(
  messageId: string,
  { force = false }: { force?: boolean } = {},
): Promise<'done' | 'none' | 'failed' | 'skipped'> {
  const db = await serviceClient()
  if (!db) return 'failed'
  let answer: Answer | null = null
  let attempt: number | null = null
  try {
    attempt = await claimKnowledge(db, messageId, force)
    if (attempt === null) return 'skipped'
    answer = await readAnswer(db, messageId)
    if (!answer) {
      await settle(db, messageId)
      return 'none'
    }
    const { message, request } = answer
    if (!message.shareable || message.knowledge_revoked_at) {
      if (request) await setKnowledge(db, request.id, 'done')
      await settle(db, messageId)
      return 'none'
    }
    const extracted = await extractHotelierFacts(await getTextModels(), {
      hotelName: answer.hotelName,
      question: request?.question ?? null,
      answer: message.text,
    })
    if (!extracted) throw { code: 'not_extracted' }
    const written = extracted.facts.length > 0 ? await writeFacts(db, answer, extracted.facts, extracted.model) : null
    // Withdrawn while the model read it: what was just written goes as the rest of the answer's knowledge did.
    const latest = maybe(await db.from('hotelier_messages').select('knowledge_revoked_at').eq('id', messageId).single())
    if (latest?.knowledge_revoked_at) {
      await withdraw(db, messageId, request?.id ?? null, latest.knowledge_revoked_at)
      if (request) await setKnowledge(db, request.id, 'done')
      await settle(db, messageId)
      return 'none'
    }
    if (request) {
      await finishRuns(
        db,
        request.id,
        written,
        written ? REPORTED : 'В ответе нет характеристик, которые можно сохранить в общих сведениях',
      )
      await setKnowledge(db, request.id, 'done')
    }
    await settle(db, messageId)
    return written ? 'done' : 'none'
  } catch (error) {
    warn('answer not processed', error)
    if (attempt !== null) await retryLater(db, messageId, answer?.request?.id ?? null, attempt).catch(() => undefined)
    return 'failed'
  }
}

/**
 * A failed try: due again after a pause, the request still on its way; after the last try the request is `failed` and
 * its runs stop waiting for the characteristics.
 */
async function retryLater(db: Service, messageId: string, requestId: string | null, attempt: number) {
  const last = attempt >= MAX_KNOWLEDGE_ATTEMPTS
  done(
    await db
      .from('hotelier_messages')
      .update({ knowledge_due_at: last ? null : new Date(Date.now() + retryDelayMs(attempt)).toISOString() })
      .eq('id', messageId),
  )
  if (!requestId || !last) return
  await setKnowledge(db, requestId, 'failed')
  await finishRuns(db, requestId, null, NOT_EXTRACTED)
}

let lastSweep = 0

/**
 * The automatic retry of the answers' knowledge, without a queue or a scheduler of its own: after the response of a
 * route that reads the hotels' knowledge or answers in the panel (`after()`), the due answers — failed tries whose
 * pause is over, workers cut off by `maxDuration` — are processed, at most `limit` and at most once a minute per
 * server instance. Each is taken for a lease (`processHotelierAnswer`), so parallel instances never repeat one. The
 * answers processed.
 */
export async function retryDueHotelierKnowledge(limit = 2): Promise<number> {
  if (Date.now() - lastSweep < SWEEP_EVERY_MS) return 0
  lastSweep = Date.now()
  const db = await serviceClient()
  if (!db) return 0
  try {
    const due = must(
      await db
        .from('hotelier_messages')
        .select('id')
        .lte('knowledge_due_at', new Date().toISOString())
        .order('knowledge_due_at')
        .limit(limit),
    )
    for (const { id } of due) await processHotelierAnswer(id)
    return due.length
  } catch (error) {
    warn('due answers not read', error)
    return 0
  }
}

async function setKnowledge(db: Service, requestId: string, status: 'done' | 'failed') {
  done(await db.from('hotelier_requests').update({ knowledge_status: status }).eq('id', requestId))
}

/**
 * The hotelier withdraws an answer's knowledge: its claims end (kept, with «Отозвано отельером»), its document leaves
 * the search. `false` when it failed.
 */
export async function revokeHotelierAnswer(messageId: string): Promise<boolean> {
  const db = await serviceClient()
  if (!db) return false
  try {
    const now = new Date().toISOString()
    const message = must(
      await db
        .from('hotelier_messages')
        .update({ knowledge_revoked_at: now, knowledge_due_at: null })
        .eq('id', messageId)
        .select('request_id')
        .single(),
    )
    await withdraw(db, messageId, message.request_id, now)
    return true
  } catch (error) {
    warn('answer not revoked', error)
    return false
  }
}

/**
 * The answer's knowledge goes: its claims end (kept, with «Отозвано отельером»), its document leaves the search, and the
 * blocks «Запрос отельеру» of its request say it is withdrawn, without its characteristics.
 */
async function withdraw(db: Service, messageId: string, requestId: string | null, now: string) {
  if (requestId)
    await updateRuns(db, requestId, (before) => ({
      ...before,
      data: { ...before.data, knowledge: 'revoked' },
      claims: [],
      limitations: [
        ...before.limitations.filter((line) => !line.startsWith(EXTRACTING) && line !== REPORTED),
        REVOKED_RUN,
      ].slice(0, 20),
    }))
  const evidence = maybe(
    await db.from('evidence').select('id').eq('provider', HOTELIER_PROVIDER).eq('external_id', messageId).maybeSingle(),
  )
  if (!evidence) return
  const links = must(await db.from('claim_evidence').select('claim_id').eq('evidence_id', evidence.id))
  for (const { claim_id } of links) {
    const claim = must(await db.from('claims').select('limitations').eq('id', claim_id).single())
    done(
      await db
        .from('claims')
        .update({ valid_to: now, limitations: [...new Set([...claim.limitations, REVOKED])] })
        .eq('id', claim_id)
        .is('valid_to', null),
    )
  }
  done(await db.from('documents').delete().eq('evidence_id', evidence.id))
}

/** The same key as `create_hotelier_request`'s: the hotel, the words, the characteristics, the room. */
export function dedupeKey(hotelId: string, question: string, keys: readonly string[], roomRef = '') {
  const words = question.replace(/\s+/g, ' ').trim().toLowerCase()
  return createHash('sha256')
    .update([hotelId, words, [...new Set(keys)].sort().join(','), roomRef].join('\n'))
    .digest('hex')
}
