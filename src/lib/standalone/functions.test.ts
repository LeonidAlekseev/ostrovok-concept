import { describe, expect, it } from 'vitest'
import { queryClient, type Row } from './query'
import { Db } from './store'
import { standaloneFunctions } from './functions'
import { callKey } from './canonical'

const TRAVELLER = 'u-traveller'
const HOTELIER = 'u-hotelier'

const tables = (): Record<string, Row[]> => ({
  hotels: [{ id: 'ota-1', data: { name: 'Отель' } }],
  hotelier_profiles: [{ user_id: HOTELIER, is_demo: true, all_hotels: true }],
  documents: [
    { id: 'd1', hotel_id: 'ota-1', kind: 'review', evidence_id: 'v1' },
    { id: 'd2', hotel_id: 'ota-1', kind: 'review', evidence_id: 'v2' },
  ],
  document_chunks: [
    { id: 'k1', document_id: 'd1', ord: 0, text: 'Отличный завтрак', embedding: '[1,0]' },
    { id: 'k2', document_id: 'd2', ord: 0, text: 'Шумная улица ночью', embedding: '[0,1]' },
  ],
})

const setup = () => {
  const data = tables()
  const functions = standaloneFunctions({
    recorded: (key) => (key === callKey('hotel_view_eyes', { lat: 1 }) ? { ok: 1 } : undefined),
  })
  const overlay = {}
  const as = (userId: string | null) => new Db((t) => data[t] ?? [], overlay, functions, { userId, service: false })
  return { as }
}

describe('the chat with the hotelier', () => {
  it('keeps the conversation as the triggers do: last message, unread, the hotelier sees it, the traveller not theirs', async () => {
    const { as } = setup()
    const traveller = queryClient(as(TRAVELLER))
    const { data: chat } = await traveller
      .from('hotelier_conversations')
      .insert({ hotel_id: 'ota-1' })
      .select('id')
      .single()
    await traveller
      .from('hotelier_messages')
      .insert({ conversation_id: chat.id, sender: 'user', text: '  Есть   кроватка? ' })
    const hotelier = queryClient(as(HOTELIER))
    const { data: inbox } = await hotelier.from('hotelier_conversations').select('last_message_text, hotelier_unread')
    expect(inbox).toEqual([{ last_message_text: 'Есть кроватка?', hotelier_unread: 1 }])
    expect((await queryClient(as('someone')).from('hotelier_conversations').select('id')).data).toEqual([])

    const { data: answer } = await hotelier
      .from('hotelier_messages')
      .insert({ conversation_id: chat.id, sender: 'hotelier', text: 'Да', shareable: true })
      .select('id, is_demo, knowledge_due_at')
      .single()
    expect(answer.is_demo).toBe(true)
    expect(answer.knowledge_due_at).not.toBeNull()
    const { data: mine } = await traveller.rpc('hotelier_my_chats').select('user_unread, last_sender')
    expect(mine).toEqual([{ user_unread: 1, last_sender: 'hotelier' }])
  })

  it('refuses a message to a closed conversation', async () => {
    const { as } = setup()
    const traveller = queryClient(as(TRAVELLER))
    const { data: chat } = await traveller
      .from('hotelier_conversations')
      .insert({ hotel_id: 'ota-1', status: 'closed' })
      .select('id')
      .single()
    const { error } = await traveller
      .from('hotelier_messages')
      .insert({ conversation_id: chat.id, sender: 'user', text: 'x' })
    expect(error?.message).toBe('hotelier_conversation_closed')
  })
})

describe('the search of the chunks', () => {
  it('fuses the full-text and the vector places by RRF (k = 60), as hotel_chunks_hybrid', async () => {
    const { as } = setup()
    const { data } = await queryClient(as(null)).rpc('hotel_chunks_hybrid', {
      hotel_id: 'ota-1',
      query: 'завтрак',
      query_embedding: '[0,1]',
      max_rows: 5,
    })
    expect(data.map((r: Row) => [r.chunk_id, r.fts_place, r.vector_place])).toEqual([
      ['k1', 1, 2],
      ['k2', null, 1],
    ])
    expect(data[0].rank).toBeCloseTo(1 / 61 + 1 / 62)
  })
})

describe('the recorded calls', () => {
  it('answers a recorded call by its arguments and fails another as an unknown function', async () => {
    const { as } = setup()
    const db = queryClient(as(null))
    expect((await db.rpc('hotel_view_eyes', { lat: 1 })).data).toEqual({ ok: 1 })
    expect((await db.rpc('hotel_view_eyes', { lat: 2 })).error?.code).toBe('PGRST202')
  })
})
