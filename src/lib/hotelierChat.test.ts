import { describe, expect, it } from 'vitest'
import {
  addMessage,
  chatOfConversation,
  conversationOf,
  matchesFilter,
  putConversation,
  senderLabel,
  type ConversationRow,
  type HotelierConversation,
  type HotelierMessage,
} from './hotelierChat'

const message = (id: string, createdAt: string): HotelierMessage => ({
  id,
  conversationId: 'c1',
  sender: 'user',
  text: id,
  requestId: null,
  shareable: false,
  knowledgeRevokedAt: null,
  demo: false,
  readAt: null,
  createdAt,
})

const conversation = (id: string, lastMessageAt: string, extra: Partial<HotelierConversation> = {}) =>
  ({
    id,
    hotelId: 'ota-1',
    hotelName: null,
    kind: 'user',
    status: 'open',
    lastMessageAt,
    lastMessageText: '',
    lastSender: null,
    userUnread: 0,
    hotelierUnread: 0,
    demo: false,
    createdAt: lastMessageAt,
    ...extra,
  }) satisfies HotelierConversation

describe('the chat with the hotelier', () => {
  it('names the traveller «Гость» for the hotelier and the hotelier «Отельер» for the traveller', () => {
    expect(senderLabel('user', 'hotelier')).toBe('Гость')
    expect(senderLabel('hotelier', 'user')).toBe('Отельер')
    expect(senderLabel('user', 'user')).toBe('Вы')
    expect(senderLabel('ai_assistant', 'user')).toBe('AI-помощник отеля')
  })

  it('keeps each message once, in time order, when Realtime brings one the feed has', () => {
    const feed = [message('b', '2026-10-28T10:01:00Z'), message('a', '2026-10-28T10:00:00Z')].reduce(addMessage, [])
    expect(addMessage(feed, message('b', '2026-10-28T10:01:00Z')).map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('puts a changed conversation first and keeps the hotel name a Realtime row lacks', () => {
    const list = [
      conversation('1', '2026-10-28T10:00:00Z', { hotelName: 'Hotel A' }),
      conversation('2', '2026-10-28T09:00:00Z'),
    ]
    const next = putConversation(list, conversation('2', '2026-10-28T11:00:00Z'))
    expect(next.map((c) => c.id)).toEqual(['2', '1'])
    expect(putConversation(list, conversation('1', '2026-10-28T12:00:00Z'))[0].hotelName).toBe('Hotel A')
  })

  it('filters by the state, the kind and the hotel', () => {
    const c = conversation('1', '2026-10-28T10:00:00Z', { kind: 'ai_request', status: 'waiting_hotelier' })
    expect(matchesFilter(c, {})).toBe(true)
    expect(matchesFilter(c, { kind: 'ai_request', status: 'waiting_hotelier', hotelId: 'ota-1' })).toBe(true)
    expect(matchesFilter(c, { kind: 'user' })).toBe(false)
    expect(matchesFilter(c, { hotelId: 'ota-2' })).toBe(false)
  })

  it('reads the joined hotel name of a list row', () => {
    const row = {
      id: '1',
      hotel_id: 'ota-1',
      user_id: 'u',
      kind: 'user',
      status: 'resolved',
      origin_chat_id: null,
      origin_tool_run_id: null,
      last_message_at: 't',
      last_message_text: 'Да',
      last_sender: 'hotelier',
      user_unread: 1,
      hotelier_unread: 0,
      is_demo: false,
      created_at: 't',
      updated_at: 't',
      hotel: { name: 'Hotel A' },
    } as ConversationRow
    expect(conversationOf(row)).toMatchObject({ hotelName: 'Hotel A', status: 'resolved', lastSender: 'hotelier' })
    // The traveller's id never leaves the row.
    expect(conversationOf(row)).not.toHaveProperty('userId')
  })
})

describe('chatOfConversation (the snapshot of «Поделиться»)', () => {
  it('signs the hotelier, marks the hotel’s assistant and keeps no ids of people', () => {
    const chat = chatOfConversation(conversation('c1', '2026-10-28T10:00:00Z', { hotelName: 'Hotel A' }), [
      { ...message('m1', '2026-10-28T09:00:00Z'), text: 'Есть балкон?' },
      { ...message('m2', '2026-10-28T09:05:00Z'), sender: 'hotelier', text: 'Да', demo: true },
      { ...message('m3', '2026-10-28T09:06:00Z'), sender: 'ai_assistant', text: 'Этаж 3' },
    ])
    expect(chat.title).toBe('Чат с отельером «Hotel A»')
    expect(chat.messages.map((m) => m.role)).toEqual(['user', 'owner', 'owner'])
    expect(chat.messages.map((m) => m.data)).toEqual([{}, { demo: true }, { hotelAi: true }])
    expect(JSON.stringify(chat)).not.toMatch(/user_id|author|email/)
  })
})
