import { describe, expect, it } from 'vitest'
import { destinations } from '../data/destinations'
import { makePlan } from './assistant'
import {
  chatGroupOf,
  chatKind,
  chatPreview,
  chatTime,
  groupChats,
  planMapHref,
  recentRequests,
  searchChats,
  tripLine,
  tripParams,
} from './assistantChatList'
import { newChat, shownHotels, type Chat, type ChatMessage } from './assistantChats'
import { newHotels } from './catalogGenerator'

const NOW = new Date(2026, 9, 24, 15, 0)
const at = (day: number, hour = 12) => new Date(2026, 9, day, hour, 30).toISOString()

const message = (role: ChatMessage['role'], text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  status: 'done',
  text,
  data: {},
  createdAt: at(24),
  ...extra,
})

const chat = (title: string, updatedAt: string, messages: ChatMessage[] = [], extra: Partial<Chat> = {}): Chat => ({
  ...newChat(updatedAt),
  title,
  messages,
  ...extra,
})

// assistant-search, Requirement: Список чатов
describe('the list of chats', () => {
  it('groups the chats by today, yesterday, the last week and earlier, keeping their order', () => {
    const chats = [
      chat('a', at(24, 12)),
      chat('b', at(24, 9)),
      chat('c', at(23)),
      chat('d', at(20)),
      chat('e', at(17)),
      chat('f', at(1)),
    ]
    expect(groupChats(chats, NOW).map((g) => [g.label, g.chats.map((c) => c.title)])).toEqual([
      ['Сегодня', ['a', 'b']],
      ['Вчера', ['c']],
      ['На прошлой неделе', ['d', 'e']],
      ['Раньше', ['f']],
    ])
    expect(groupChats([chat('a', at(1))], NOW).map((g) => g.label)).toEqual(['Раньше'])
    expect(chatGroupOf(at(25), NOW)).toBe('Сегодня')
  })

  it('shows the time of today and the date before', () => {
    expect(chatTime(new Date(2026, 9, 24, 9, 5).toISOString(), NOW)).toBe('09:05')
    expect(chatTime(new Date(2026, 9, 3, 9, 5).toISOString(), NOW)).toBe('03 окт')
  })

  it('takes the icon from the kind of trip of the brief', () => {
    expect(chatKind({ vibe: 'sea' })).toBe('sea')
    expect(chatKind({ vibe: 'europe' })).toBe('city')
    expect(chatKind({ destinationId: 'valencia' })).toBe('city')
    expect(chatKind({ vibe: 'any' })).toBe('chat')
    expect(chatKind({})).toBe('chat')
  })

  it('previews the last words, not the steps or a pending answer', () => {
    const c = chat('x', at(24), [
      message('user', 'Тихий отель\nв Валенсии'),
      message('agent', '', { data: { step: { agent: 'search', title: 'Подбираю отели' } } }),
      message('assistant', '', { status: 'pending' }),
    ])
    expect(chatPreview(c)).toBe('Тихий отель в Валенсии')
    expect(chatPreview(chat('y', at(24)))).toBe('')
  })

  it('finds the chats by the title and by the messages (Scenario: Поиск)', () => {
    const chats = [
      chat('Отель у моря', at(24), [message('user', 'Хочу в Валенсию в ноябре')]),
      chat('Валенсия на выходные', at(23)),
      chat('Горы', at(22), [message('user', 'Тбилиси')]),
    ]
    expect(searchChats(chats, 'Валенси').map((c) => c.title)).toEqual(['Отель у моря', 'Валенсия на выходные'])
    expect(searchChats(chats, '  ').length).toBe(3)
    expect(searchChats(chats, 'берлин')).toEqual([])
  })
})

// assistant-search, Requirement: Последние запросы и возможности
describe('the recent requests', () => {
  it('are the five newest different messages of the traveller over all the chats', () => {
    const chats = [
      chat('a', at(24), [
        message('user', 'Тихий отель', { createdAt: at(24, 10) }),
        message('assistant', 'Записал', { createdAt: at(24, 11) }),
        message('user', 'а повыше?', { createdAt: at(24, 13) }),
      ]),
      chat('b', at(23), [
        message('user', 'тихий  отель', { createdAt: at(23, 9) }),
        ...['1', '2', '3', '4'].map((t, i) => message('user', `запрос ${t}`, { createdAt: at(22, 10 + i) })),
      ]),
    ]
    expect(recentRequests(chats)).toEqual(['а повыше?', 'Тихий отель', 'запрос 4', 'запрос 3', 'запрос 2'])
  })
})

// assistant-search, Requirement: Параметры поездки
describe('the trip of a chat', () => {
  const lisbon = { destinationId: 'lisbon', when: 9, party: 'solo' as const }
  const plan = makePlan(lisbon, '2026-10-24', destinations, newHotels)

  it('takes the named days, the party and the city of the brief first', () => {
    const c = chat('x', at(24), [message('assistant', '', { data: { plan } })], {
      brief: { ...lisbon, party: 'couple', dates: { checkIn: '2026-11-10', checkOut: '2026-11-15' } },
    })
    const trip = tripParams(c, destinations)
    expect(trip).toMatchObject({ checkIn: '2026-11-10', checkOut: '2026-11-15', nights: 5 })
    expect(trip.guests).toEqual({ adults: 2, children: 0, rooms: 1 })
    expect(trip.city?.id).toBe('lisbon')
    expect(tripLine(trip)).toBe('2 гостя · 10–15 нояб. · Лиссабон')
  })

  it('takes the dates and the guests of the newest plan, and knows nothing without them', () => {
    const c = chat('x', at(24), [message('assistant', '', { data: { plan } })], { brief: { vibe: 'sea' } })
    const trip = tripParams(c, destinations)
    expect(trip.checkIn).toBe(plan.query.checkIn)
    expect(trip.guests).toEqual(plan.query.guests)
    expect(tripParams(chat('y', at(24)), destinations)).toEqual({})
    expect(tripLine({})).toBe('')
  })

  it('maps the answer’s hotels on the search page with the plan’s dates', () => {
    const href = planMapHref(plan)
    const ids = plan.options.flatMap((o) => (o.hotel ? [o.hotel.id] : []))
    expect(href).toContain(`/search?hotels=${ids.join(',')}&from=assistant`)
    expect(href).toContain(`checkin=${plan.query.checkIn}`)
  })

  it('knows the hotels the chat has shown, for «Другие варианты»', () => {
    const c = chat('x', at(24), [message('assistant', '', { data: { plan } })])
    expect([...shownHotels(c)]).toEqual(plan.options.flatMap((o) => (o.hotel ? [o.hotel.id] : [])))
  })
})
