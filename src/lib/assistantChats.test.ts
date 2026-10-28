// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CHATS_KEY,
  MAX_GUEST_CHATS,
  chatTitle,
  dialogOf,
  hotelChatOf,
  lastPhotoMessage,
  loadGuestChats,
  mergeServerMessage,
  newChat,
  parseChat,
  parseChats,
  saveGuestChats,
  type Chat,
  type ChatMessage,
} from './assistantChats'
import { DIALOG_KEY } from './assistantDialog'
import { RUN_ID, groupedResult, sampleResult } from '@/test/toolResult'

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

  // assistant-geo, Requirement: Карта в ответе Эвала
  it('keeps the map of an answer and drops a damaged one', () => {
    const map = {
      points: [
        { kind: 'hotel', label: 'Отель', lat: 39.45, lon: -0.36 },
        { kind: 'place', label: 'Аптека', lat: 39.452, lon: -0.359 },
      ],
      routes: [],
      attribution: '© OpenStreetMap',
    }
    const kept = parseChat(chatWith('2026-10-25T10:00:00Z', message('assistant', 'Рядом', { data: { map } as never })))
    expect(kept?.messages[0].data).toEqual({ map })
    const odd = parseChat(
      chatWith('2026-10-25T10:00:00Z', message('assistant', 'x', { data: { map: { points: 'x' } } as never })),
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

// assistant-search, Requirements: Фото во вложениях, Фото у гостя
describe('the photos of a message', () => {
  const preview = 'data:image/webp;base64,AAAA'
  const path = `${crypto.randomUUID()}/${crypto.randomUUID()}/${crypto.randomUUID()}/0.webp`

  it('keeps the photos’ path, preview, link and size; drops what is not a picture of the chat', () => {
    const data = {
      attachments: [
        { path, width: 1600, height: 1200 },
        { preview, width: 320, height: 240 },
        { url: 'https://x.supabase.co/storage/v1/object/public/a/0.webp', width: 10, height: 10 },
        { preview: 'javascript:alert(1)', url: 'ftp://x', path: '../other/0.webp', width: 5, height: 5 },
        { preview, width: 0, height: 10 },
        'photo',
      ],
    }
    const parsed = parseChat(
      JSON.parse(
        JSON.stringify(
          chatWith('2026-10-25T10:00:00.000Z', message('user', '', { data: data as unknown as ChatMessage['data'] })),
        ),
      ),
    )
    expect(parsed?.messages[0].data.attachments).toEqual([
      { path, width: 1600, height: 1200 },
      { preview, width: 320, height: 240 },
      { url: 'https://x.supabase.co/storage/v1/object/public/a/0.webp', width: 10, height: 10 },
      { width: 5, height: 5 },
    ])
  })

  it('takes at most four photos a message', () => {
    const attachments = Array.from({ length: 6 }, () => ({ preview, width: 1, height: 1 }))
    const parsed = parseChat(chatWith('2026-10-25T10:00:00.000Z', message('user', '', { data: { attachments } })))
    expect(parsed?.messages[0].data.attachments).toHaveLength(4)
  })

  it('reads a message of photos only as «Фото» for the model and finds the newest one', () => {
    const photos = message('user', '', { data: { attachments: [{ preview, width: 1, height: 1 }] } })
    const chat = chatWith(
      '2026-10-25T10:00:00.000Z',
      message('user', 'в Валенсию'),
      photos,
      message('assistant', 'Что сделать с фото?'),
    )
    expect(dialogOf(chat).map((m) => m.text)).toEqual(['в Валенсию', 'Фото', 'Что сделать с фото?'])
    expect(lastPhotoMessage(chat)?.id).toBe(photos.id)
  })

  it('lets the oldest chats’ previews go when the guest’s storage is full, the messages stay', () => {
    const photo = (at: string) =>
      chatWith(at, message('user', 'вот', { data: { attachments: [{ preview, width: 320, height: 240 }] } }))
    const chats = [photo('2026-10-25T10:00:00.000Z'), photo('2026-10-24T10:00:00.000Z')]
    const setItem = Storage.prototype.setItem
    let calls = 0
    // The first write overflows; the one without the older chat's preview fits.
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (calls++ === 0) throw new DOMException('full', 'QuotaExceededError')
      setItem.call(this, key, value)
    })
    saveGuestChats(chats)
    spy.mockRestore()
    const saved = loadGuestChats()
    expect(saved[0].messages[0].data.attachments).toEqual([{ preview, width: 320, height: 240 }])
    expect(saved[1].messages[0].data.attachments).toEqual([{ width: 320, height: 240 }])
    expect(saved[1].messages[0].text).toBe('вот')
  })
})

// assistant-search, Requirement: Восстановление блоков инструментов
describe('the runs of the steps in the saved chats', () => {
  const step = { agent: 'features', title: 'Анализ шума', params: 'карты шума EEA', result: 'Ночью 55–59 дБ' }
  const chatWith = (data: unknown): unknown => ({
    ...newChat('2026-10-27T10:00:00.000Z'),
    messages: [{ ...message('agent', ''), data }],
  })

  it('keeps the run with its sources after a reload (Scenario: Перезагрузка)', () => {
    const run = { id: RUN_ID, result: sampleResult }
    const chat = chatWith({ step: { ...step, run } }) as Chat
    saveGuestChats([chat])
    expect(loadGuestChats()[0].messages[0].data.step).toEqual({ ...step, run })
  })

  it('keeps the characteristics by hotel of a tool of the choice after a reload', () => {
    const run = { id: RUN_ID, result: groupedResult }
    saveGuestChats([chatWith({ step: { ...step, run } }) as Chat])
    expect(loadGuestChats()[0].messages[0].data.step?.run?.result.groups).toEqual(groupedResult.groups)
  })

  it('shows an older step without a run as before, and drops a run off the contract only', () => {
    expect(parseChat(chatWith({ step }))!.messages[0].data.step).toEqual(step)
    const broken = { id: RUN_ID, result: { ...sampleResult, claims: 'много' } }
    expect(parseChat(chatWith({ step: { ...step, run: broken } }))!.messages[0].data.step).toEqual(step)
  })
})

// hotelier-knowledge, Requirement: Ответ отельера в чате Эвала
describe('mergeServerMessage', () => {
  const run = (status: 'pending' | 'success', answer?: string) => ({
    id: '00000000-0000-4000-8000-0000000001a1',
    result: {
      status,
      summary: answer ?? 'Ждёт',
      data: { request_id: 'r1', question: 'Балкон?', ...(answer && { answer, knowledge: 'done' }) },
      evidence: [],
      claims: [],
      calculations: [],
      method: null,
      limitations: [],
      error: null,
    },
  })
  const step = (status: 'pending' | 'success', answer?: string): ChatMessage => ({
    id: 'step',
    role: 'agent',
    status: 'done',
    text: '',
    data: { step: { agent: 'hotelier', title: 'Запрос отельеру', run: run(status, answer) } },
    createdAt: '2026-10-28T10:00:00Z',
  })
  const chat = (): Chat => ({ ...newChat('2026-10-28T09:00:00Z'), messages: [step('pending')] })

  it('adds the hotelier’s answer, unread when the traveller is elsewhere', () => {
    const owner: ChatMessage = {
      id: 'o',
      role: 'owner',
      status: 'done',
      text: 'Да',
      data: {},
      createdAt: '2026-10-28T11:00:00Z',
    }
    expect(mergeServerMessage(chat(), owner, false)).toMatchObject({
      unread: true,
      messages: [{ id: 'step' }, { id: 'o' }],
    })
    expect(mergeServerMessage(chat(), owner, true).unread).toBe(false)
  })

  it('finishes the waiting step, and leaves every other echo as it is', () => {
    const before = chat()
    const after = mergeServerMessage(before, step('success', 'Да'), true)
    expect(after.messages[0].data.step?.run?.result.status).toBe('success')
    // An older echo of the browser's own save does not undo the answer.
    expect(mergeServerMessage(after, step('pending'), true)).toBe(after)
    // A message of the browser's own is not the server's to add.
    const user: ChatMessage = {
      id: 'u',
      role: 'user',
      status: 'done',
      text: 'x',
      data: {},
      createdAt: '2026-10-28T12:00:00Z',
    }
    expect(mergeServerMessage(before, user, true)).toBe(before)
  })
})
