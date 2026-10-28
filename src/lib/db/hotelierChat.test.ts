import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/database.types'
import { sendHotelierMessage, sendTravellerMessage, setConversationStatus } from './hotelierChat'

vi.mock('server-only', () => ({}))

type Answer = { data: unknown; error: { code: string; message: string } | null }
type Call = { table: string; op: string; value?: unknown; filters: unknown[][] }

const row = (extra: object = {}) => ({
  id: 'c1',
  hotel_id: 'ota-1',
  user_id: 'u1',
  kind: 'user',
  status: 'open',
  origin_chat_id: null,
  origin_tool_run_id: null,
  last_message_at: '2026-10-28T10:00:00Z',
  last_message_text: '',
  last_sender: null,
  user_unread: 0,
  hotelier_unread: 0,
  created_at: '2026-10-28T10:00:00Z',
  updated_at: '2026-10-28T10:00:00Z',
  ...extra,
})
const messageRow = (extra: object = {}) => ({
  id: 'm1',
  conversation_id: 'c1',
  sender: 'user',
  author_id: 'u1',
  text: 'Есть балкон?',
  data: {},
  request_id: null,
  shareable: false,
  read_at: null,
  created_at: '2026-10-28T10:00:00Z',
  ...extra,
})

/** A client whose answers come in order, per table and operation: `answers['hotelier_conversations:select']`. */
function fake(answers: Record<string, Answer[]>, rpc: Answer = { data: true, error: null }) {
  const calls: Call[] = []
  const next = (call: Call): Answer => answers[`${call.table}:${call.op}`]?.shift() ?? { data: null, error: null }
  const client = {
    rpc: vi.fn(async () => rpc),
    from: (table: string) => {
      const call: Call = { table, op: 'select', filters: [] }
      calls.push(call)
      const query = {
        select: () => query,
        insert: (value: unknown) => ((call.op = 'insert'), (call.value = value), query),
        eq: (k: string, v: unknown) => (call.filters.push(['eq', k, v]), query),
        neq: (k: string, v: unknown) => (call.filters.push(['neq', k, v]), query),
        maybeSingle: async () => next(call),
        single: async () => next(call),
      }
      return query
    },
  }
  return { client: client as unknown as SupabaseClient<Database>, calls }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('sendTravellerMessage', () => {
  it('writes into the open chat, starting one when there is none', async () => {
    const { client, calls } = fake({
      'hotelier_conversations:select': [{ data: null, error: null }],
      'hotelier_conversations:insert': [{ data: row(), error: null }],
      'hotelier_messages:insert': [{ data: messageRow(), error: null }],
    })
    const result = await sendTravellerMessage(client, 'u1', 'ota-1', 'Есть балкон?')
    expect(result).toMatchObject({ ok: true, value: { conversation: { id: 'c1' }, message: { sender: 'user' } } })
    expect(calls.find((c) => c.op === 'insert' && c.table === 'hotelier_messages')?.value).toEqual({
      conversation_id: 'c1',
      sender: 'user',
      author_id: 'u1',
      text: 'Есть балкон?',
    })
    // The open chat is the traveller's own, never a closed one.
    expect(calls[0].filters).toEqual(
      expect.arrayContaining([
        ['eq', 'user_id', 'u1'],
        ['neq', 'status', 'closed'],
      ]),
    )
  })

  it('finds the chat a parallel request started', async () => {
    const { client } = fake({
      'hotelier_conversations:select': [
        { data: null, error: null },
        { data: row({ id: 'c2' }), error: null },
      ],
      'hotelier_conversations:insert': [{ data: null, error: { code: '23505', message: 'duplicate' } }],
      'hotelier_messages:insert': [{ data: messageRow({ conversation_id: 'c2' }), error: null }],
    })
    expect(await sendTravellerMessage(client, 'u1', 'ota-1', 'Есть балкон?')).toMatchObject({
      ok: true,
      value: { conversation: { id: 'c2' } },
    })
  })

  it.each([
    ['P0001', 'hotelier_conversation_closed', 'closed'],
    ['P0001', 'hotelier_rate_limited', 'rate_limited'],
    ['42501', 'new row violates row-level security policy', 'forbidden'],
    ['XX000', 'boom «секрет»', 'store'],
  ])('tells the refusal %s %s apart', async (code, message, failure) => {
    const { client } = fake({
      'hotelier_conversations:select': [{ data: row(), error: null }],
      'hotelier_messages:insert': [{ data: null, error: { code, message } }],
    })
    expect(await sendTravellerMessage(client, 'u1', 'ota-1', 'x')).toEqual({ ok: false, failure })
    // Only the code is logged, never the message.
    for (const [line] of vi.mocked(console.warn).mock.calls) expect(String(line)).not.toContain('секрет')
  })
})

describe('sendHotelierMessage', () => {
  it('writes as the hotelier with the request it answers', async () => {
    const { client, calls } = fake({
      'hotelier_messages:insert': [{ data: messageRow({ sender: 'hotelier', shareable: true }), error: null }],
    })
    const result = await sendHotelierMessage(client, 'h1', 'c1', { text: 'Да', shareable: true, requestId: 'r1' })
    expect(result).toMatchObject({ ok: true, value: { sender: 'hotelier', shareable: true } })
    expect(calls[0].value).toMatchObject({ sender: 'hotelier', author_id: 'h1', request_id: 'r1', shareable: true })
  })
})

describe('setConversationStatus', () => {
  it('is refused when the database says the caller may not', async () => {
    const { client } = fake({}, { data: false, error: null })
    expect(await setConversationStatus(client, 'c1', 'resolved')).toEqual({ ok: false, failure: 'forbidden' })
  })

  it('reads the conversation after the change', async () => {
    const { client } = fake({ 'hotelier_conversations:select': [{ data: row({ status: 'resolved' }), error: null }] })
    expect(await setConversationStatus(client, 'c1', 'resolved')).toMatchObject({
      ok: true,
      value: { status: 'resolved' },
    })
  })
})
