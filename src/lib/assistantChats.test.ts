// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  CHATS_KEY,
  MAX_GUEST_CHATS,
  chatTitle,
  dialogOf,
  hotelChatOf,
  loadGuestChats,
  newChat,
  parseChat,
  parseChats,
  saveGuestChats,
  type Chat,
  type ChatMessage,
} from './assistantChats'
import { DIALOG_KEY } from './assistantDialog'

afterEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

const message = (role: ChatMessage['role'], text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  status: 'done',
  text,
  data: {},
  createdAt: new Date().toISOString(),
  ...extra,
})

const chatWith = (updatedAt: string, ...messages: ChatMessage[]): Chat => ({
  ...newChat(updatedAt),
  title: 'чат',
  messages,
})

// assistant-search, Requirement: История чатов
describe('the chats', () => {
  it('keeps the role, the status and the data of a message', () => {
    const chat = chatWith(
      '2026-10-24T10:00:00.000Z',
      message('user', 'тихий отель'),
      message('agent', '', { data: { step: { agent: 'search', title: 'Подбираю отели', result: 'нашёл 3 отеля' } } }),
      message('owner', 'Номера выше 4 этажа: 501, 502', { status: 'pending' }),
    )
    expect(parseChat(JSON.parse(JSON.stringify(chat)))).toEqual(chat)
  })

  it('skips a damaged chat, keeps the rest', () => {
    const good = chatWith('2026-10-24T10:00:00.000Z', message('user', 'к морю'))
    const bad = { ...good, id: 'x', messages: [{ ...good.messages[0], role: 'bot' }] }
    expect(parseChats([bad, good, 1, null])).toEqual([good])
    expect(parseChats('nope')).toEqual([])
  })

  it('gives the model only the done dialog, without the steps', () => {
    const chat = chatWith(
      '2026-10-24T10:00:00.000Z',
      message('user', 'к морю'),
      message('agent', '', { data: { step: { agent: 'search', title: 'Подбираю' } } }),
      message('assistant', 'Записал: море.'),
      message('assistant', 'Не получилось ответить.', { status: 'failed' }),
      message('user', 'в октябре'),
      message('assistant', '', { status: 'pending' }),
    )
    expect(dialogOf(chat)).toEqual([
      { role: 'user', text: 'к морю' },
      { role: 'assistant', text: 'Записал: море.' },
      { role: 'user', text: 'в октябре' },
    ])
  })

  it('titles a chat by the first words', () => {
    expect(chatTitle('  тихий   отель\nв Валенсии ')).toBe('тихий отель в Валенсии')
    expect(chatTitle('а'.repeat(80))).toHaveLength(60)
  })
})

describe('the guest’s chats', () => {
  it('keeps the newest chats with messages, newest first', () => {
    const chats = Array.from({ length: MAX_GUEST_CHATS + 2 }, (_, i) =>
      chatWith(new Date(Date.UTC(2026, 9, 1, i)).toISOString(), message('user', `чат ${i}`)),
    )
    saveGuestChats([...chats, newChat()])
    const loaded = loadGuestChats()
    expect(loaded).toHaveLength(MAX_GUEST_CHATS)
    expect(loaded[0].messages[0].text).toBe(`чат ${MAX_GUEST_CHATS + 1}`)
  })

  it('erases the key when no chat has messages', () => {
    window.localStorage.setItem(CHATS_KEY, '[]')
    saveGuestChats([newChat()])
    expect(window.localStorage.getItem(CHATS_KEY)).toBeNull()
  })

  it('moves the dialog of an older version into a chat once', () => {
    window.sessionStorage.setItem(
      DIALOG_KEY,
      JSON.stringify({
        messages: [
          { from: 'user', text: 'к морю' },
          { from: 'agent', text: 'Записал: море. Когда планируете поехать?' },
        ],
        brief: { vibe: 'sea' },
        question: { id: 'when', text: 'Когда планируете поехать?', replies: ['Не важно'] },
      }),
    )
    const [chat] = loadGuestChats()
    expect(chat).toMatchObject({ title: 'к морю', brief: { vibe: 'sea' }, question: { id: 'when' } })
    expect(chat.messages.map((m) => [m.role, m.status, m.text])).toEqual([
      ['user', 'done', 'к морю'],
      ['assistant', 'done', 'Записал: море. Когда планируете поехать?'],
    ])
    expect(window.sessionStorage.getItem(DIALOG_KEY)).toBeNull()
    expect(loadGuestChats()).toHaveLength(1)
  })
})

// assistant-search, Requirements: Вопрос об отеле, Пометка непроверенного
describe('the chats about a hotel', () => {
  it('keeps the unverified part of an answer and drops a damaged one', () => {
    const kept = parseChat({
      ...chatWith('2026-10-25T10:00:00Z', message('assistant', 'Из данных', { data: { unverified: 'Из знаний' } })),
    })
    expect(kept?.messages[0].data).toEqual({ unverified: 'Из знаний' })
    const odd = parseChat(
      chatWith('2026-10-25T10:00:00Z', message('assistant', 'x', { data: { unverified: 5 } as never })),
    )
    expect(odd?.messages[0].data).toEqual({})
  })

  it('keeps the hotel in the brief and finds the newest chat of a hotel', () => {
    const about = (updatedAt: string, hotelId: string, ...messages: ChatMessage[]): Chat => ({
      ...chatWith(updatedAt, ...messages),
      brief: { hotelId },
    })
    const old = about('2026-10-24T10:00:00Z', 'ota-1', message('user', 'a'))
    const recent = about('2026-10-25T10:00:00Z', 'ota-1', message('user', 'b'))
    const other = about('2026-10-25T11:00:00Z', 'ota-2', message('user', 'c'))
    const empty = about('2026-10-25T12:00:00Z', 'ota-1')
    expect(parseChat(JSON.parse(JSON.stringify(recent)))?.brief.hotelId).toBe('ota-1')
    expect(hotelChatOf([old, other, recent, empty], 'ota-1')).toBe(recent)
    expect(hotelChatOf([other], 'ota-1')).toBeUndefined()
  })
})
