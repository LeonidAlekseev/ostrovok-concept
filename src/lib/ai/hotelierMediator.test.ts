import { MockLanguageModelV4 } from 'ai/test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HotelClaim } from '../db/claims'
import { getHotel } from '../catalogGenerator'
import { cited, contradicts, mediate } from './hotelierMediator'

const db = vi.hoisted(() => ({
  conversation: null as object | null,
  messages: [] as object[],
  writes: [] as { table: string; op: string; value: unknown }[],
}))
const deps = vi.hoisted(() => ({ models: undefined as unknown, claims: [] as unknown[] }))

vi.mock('../db/serviceClient', () => ({
  serviceClient: async () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: async () => ({ data: table === 'hotelier_messages' ? db.messages : [], error: null }),
        maybeSingle: async () => ({ data: db.conversation, error: null }),
        single: async () => ({ data: { id: 'request-1' }, error: null }),
        insert: (value: unknown) => {
          db.writes.push({ table, op: 'insert', value })
          return Object.assign(Promise.resolve({ error: null }), query)
        },
        update: (value: unknown) => {
          db.writes.push({ table, op: 'update', value })
          return { eq: async () => ({ error: null }) }
        },
      }
      return query
    },
  }),
}))
vi.mock('../db/catalog', () => ({ loadHotel: async (id: string) => getHotel(id) }))
vi.mock('../db/hotelDetails', () => ({ loadHotelDetails: async () => null }))
vi.mock('../db/claims', () => ({
  loadHotelierClaims: async () => deps.claims,
  searchHotelKnowledge: async () => [],
  loadEvidence: async () => [],
}))
vi.mock('./model', () => ({ getTextModels: async () => deps.models, REMARK_MODEL_ID: 'bolt' }))
vi.mock('../secrets', () => ({ getSecret: async () => undefined }))

const hotelId = 'prague-old-town-lantern'
const claim = (value: HotelClaim['value'], id = 'c1'): HotelClaim => ({
  id,
  property: 'hotelier.room.balcony',
  sourceKey: `hotelier:${id}`,
  value,
  unit: null,
  status: 'reported',
  confidence: 0.75,
  method: { room: 'Deluxe' },
  observedAt: '2026-10-28T10:00:00Z',
  validFrom: null,
  validTo: null,
  limitations: [],
  calculation: null,
  evidence: [
    {
      id: 'e1',
      role: 'source',
      type: 'hotelier',
      title: 'Ответ отельера',
      provider: 'Отельер',
      externalId: 'm0',
      url: null,
      retrievedAt: '2026-10-28T10:00:00Z',
      excerpt: 'Со слов отельера, номера Deluxe: балкон в номере — есть.',
      datasetId: null,
      demo: true,
    },
  ],
  demo: true,
})
const decides = (decision: object) =>
  new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text' as const, text: JSON.stringify(decision) }],
      finishReason: { unified: 'stop' as const, raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    },
  })
const ask = (text: string, older: object[] = []) => {
  db.messages = [{ id: 'm1', sender: 'user', text, created_at: new Date().toISOString() }, ...older]
  return mediate('conv-1', 'm1')
}
const written = (table: string) => db.writes.filter((w) => w.table === table)

beforeEach(() => {
  db.conversation = { id: 'conv-1', hotel_id: hotelId, user_id: 'u1', kind: 'user', status: 'open' }
  db.writes = []
  deps.claims = [claim({ kind: 'boolean', value: true })]
  deps.models = undefined
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

// hotelier-knowledge, Requirement: AI-помощник отеля в чате с отельером
describe('the hotel’s AI assistant', () => {
  it('answers from the hotelier’s characteristic with its source, as the assistant', async () => {
    const model = decides({
      decision: 'answer',
      answer: 'По словам отельера, в номерах Deluxe есть балкон.',
      claim_ids: ['C1'],
      chunk_ids: [],
      hotel_data: false,
    })
    deps.models = [{ id: 'bolt', model, timeoutMs: 1000 }]
    expect(await ask('Есть ли балкон в номерах Deluxe?')).toBe('answered')
    const [message] = written('hotelier_messages')
    expect(message.value).toMatchObject({
      sender: 'ai_assistant',
      author_id: null,
      // The demo's are said to be the demo's, whatever the model wrote.
      text: 'По словам отельера, в номерах Deluxe есть балкон. Сведения отельера здесь — демонстрационные (демо), не настоящий ответ отеля.',
      data: {
        run: {
          result: {
            status: 'success',
            claims: [{ id: 'c1', status: 'reported', confidence: 0.75, demo: true }],
            evidence: [{ id: 'e1', source_type: 'hotelier', demo: true }],
          },
        },
      },
    })
    // The traveller's words reach the model only as quoted data.
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain('<<<ЧАТ')
  })

  it('passes to the hotelier what only the hotel confirms, without asking a model', async () => {
    const model = decides({ decision: 'answer', answer: 'Да', claim_ids: [], chunk_ids: [], hotel_data: true })
    deps.models = [{ id: 'bolt', model, timeoutMs: 1000 }]
    expect(await ask('Есть ли свободные номера с балконом на 10 ноября?')).toBe('escalated')
    expect(model.doGenerateCalls).toHaveLength(0)
    expect(written('hotelier_requests')[0].value).toMatchObject({
      hotel_id: hotelId,
      user_id: 'u1',
      characteristic_keys: ['room.balcony'],
      dedupe_key: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    expect(written('hotelier_conversations')[0].value).toEqual({ status: 'waiting_hotelier' })
    expect(written('hotelier_messages')[0].value).toMatchObject({ sender: 'ai_assistant', request_id: 'request-1' })
  })

  it('passes it on when the answer cites nothing, the hotelier contradicts themselves or no model answers', async () => {
    deps.models = [
      {
        id: 'bolt',
        model: decides({
          decision: 'answer',
          answer: 'Да, есть.',
          claim_ids: ['C9'],
          chunk_ids: [],
          hotel_data: false,
        }),
        timeoutMs: 1000,
      },
    ]
    expect(await ask('Есть ли балкон?')).toBe('escalated')
    deps.claims = [claim({ kind: 'boolean', value: true }), claim({ kind: 'boolean', value: false }, 'c2')]
    expect(await ask('Есть ли балкон?')).toBe('escalated')
    deps.models = undefined
    expect(await ask('Есть ли балкон?')).toBe('escalated')
  })

  it('stays silent while the hotelier is in the chat, and for a closed or an old message', async () => {
    const recent = { id: 'h1', sender: 'hotelier', text: 'Здравствуйте', created_at: new Date().toISOString() }
    db.messages = [recent, { id: 'm1', sender: 'user', text: 'Балкон?', created_at: new Date().toISOString() }]
    expect(await mediate('conv-1', 'm1')).toBe('skipped')
    db.messages = [
      { id: 'm1', sender: 'user', text: 'Балкон?', created_at: '2026-10-28T10:00:00Z' },
      { id: 'm2', sender: 'user', text: 'А вид?', created_at: '2026-10-28T10:01:00Z' },
    ].reverse()
    expect(await mediate('conv-1', 'm1')).toBe('skipped')
    db.conversation = { id: 'conv-1', hotel_id: hotelId, user_id: 'u1', kind: 'user', status: 'closed' }
    expect(await ask('Балкон?')).toBe('skipped')
    expect(db.writes).toEqual([])
  })
})

describe('the helpers of the assistant', () => {
  it('maps the cited ids back and drops the unknown ones', () => {
    expect(cited(['C2', '[C1]', 'C7', 'x'], 'C', ['a', 'b'])).toEqual(['b', 'a'])
  })

  it('finds two answers of one characteristic that differ', () => {
    expect(contradicts([claim({ kind: 'boolean', value: true }), claim({ kind: 'boolean', value: true }, 'c2')])).toBe(
      false,
    )
    expect(contradicts([claim({ kind: 'boolean', value: true }), claim({ kind: 'boolean', value: false }, 'c2')])).toBe(
      true,
    )
  })
})
