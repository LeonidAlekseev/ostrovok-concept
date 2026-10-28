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
 * The hotel's knowledge from its hotelier's answers (hotelier-knowledge), written by the server after the answer
 * (`after()` of the route, or `npm run db:hotelier-knowledge` for what failed): the only module of the app with the
 * service role, which the store of claims needs — no browser, no request of a user reaches it. Only an answer the
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
async function finishRuns(db: Service, requestId: string, written: Written | null, limitation: string) {
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
    const before = parsed.data
    const result: ToolResult = {
      ...before,
      data: { ...before.data, knowledge: written ? 'done' : 'none' },
      evidence: written ? [written.evidence] : before.evidence,
      claims: written ? written.claims : before.claims,
      limitations: [
        ...before.limitations.filter((line) => !line.startsWith('Характеристики из ответа извлекаются')),
        limitation,
      ].slice(0, 20),
    }
    done(
      await db
        .from('tool_runs')
        .update({ result_data: result as unknown as Json, updated_at: new Date().toISOString() })
        .eq('id', run.id),
    )
    if (written)
      await db
        .from('tool_run_evidence')
        .upsert(
          { tool_run_id: run.id, user_id: run.user_id, evidence_id: written.evidenceId },
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
  if (!answer || !answer.message.shareable || facts.length === 0) return null
  const written = await writeFacts(db, answer, facts, model, { conflict })
  if (answer.request) {
    await finishRuns(db, answer.request.id, written, REPORTED)
    await setKnowledge(db, answer.request.id, 'done')
  }
  return written
}

/**
 * The knowledge of a hotelier's answer: its facts when it is shareable, the waiting runs with them, the request's
 * `knowledge_status`. Never throws; a failure leaves the request `failed` for the re-run.
 */
export async function processHotelierAnswer(messageId: string): Promise<'done' | 'none' | 'failed'> {
  const db = await serviceClient()
  if (!db) return 'failed'
  let answer: Answer | null = null
  try {
    answer = await readAnswer(db, messageId)
    if (!answer) return 'none'
    const { message, request } = answer
    if (!message.shareable || message.knowledge_revoked_at) {
      if (request) await setKnowledge(db, request.id, 'done')
      return 'none'
    }
    const extracted = await extractHotelierFacts(await getTextModels(), {
      hotelName: answer.hotelName,
      question: request?.question ?? null,
      answer: message.text,
    })
    if (!extracted) {
      if (request) await setKnowledge(db, request.id, 'failed')
      return 'failed'
    }
    const written = extracted.facts.length > 0 ? await writeFacts(db, answer, extracted.facts, extracted.model) : null
    if (request) {
      await finishRuns(
        db,
        request.id,
        written,
        written ? REPORTED : 'В ответе нет характеристик, которые можно сохранить в общих сведениях',
      )
      await setKnowledge(db, request.id, 'done')
    }
    return written ? 'done' : 'none'
  } catch (error) {
    warn('answer not processed', error)
    if (answer?.request) await setKnowledge(db, answer.request.id, 'failed').catch(() => undefined)
    return 'failed'
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
    done(await db.from('hotelier_messages').update({ knowledge_revoked_at: now }).eq('id', messageId))
    const evidence = maybe(
      await db
        .from('evidence')
        .select('id')
        .eq('provider', HOTELIER_PROVIDER)
        .eq('external_id', messageId)
        .maybeSingle(),
    )
    if (!evidence) return true
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
    return true
  } catch (error) {
    warn('answer not revoked', error)
    return false
  }
}

/** The same key as `create_hotelier_request`'s: the hotel, the words, the characteristics, the room. */
export function dedupeKey(hotelId: string, question: string, keys: readonly string[], roomRef = '') {
  const words = question.replace(/\s+/g, ' ').trim().toLowerCase()
  return createHash('sha256')
    .update([hotelId, words, [...new Set(keys)].sort().join(','), roomRef].join('\n'))
    .digest('hex')
}
