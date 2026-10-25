import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { destinations } from '../../data/destinations'
import { makePlan, type Plan } from '../../lib/assistant'
import { CHATS_KEY, newChat, type Chat, type ChatMessage } from '../../lib/assistantChats'
import { getHotel, hotels, newHotels } from '../../lib/catalogGenerator'
import { addDays, todayIso } from '../../lib/dates'
import { catalogFetch } from '../../test/catalog'
import { AssistantSearch } from './AssistantSearch'
import { SharedChat } from './SharedChat'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const fetchMock = vi.fn<typeof fetch>()
const THINK_MS = 650
beforeEach(() => {
  const realSetTimeout = globalThis.setTimeout
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
    realSetTimeout(handler, ms === THINK_MS ? 0 : ms, ...args)) as typeof setTimeout)
  vi.stubGlobal('fetch', ((input, init) =>
    String(input).startsWith('/api/hotels') ? catalogFetch(input) : fetchMock(input, init)) as typeof fetch)
})

afterEach(() => {
  vi.restoreAllMocks()
  fetchMock.mockReset()
  push.mockClear()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/assistant')
  delete (window as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
})

const answer = (body: object) => Response.json({ source: 'model', ...body })
const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1]?.body as string)

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const message = (role: ChatMessage['role'], text: string, createdAt: string, extra: Partial<ChatMessage> = {}) =>
  ({ id: crypto.randomUUID(), role, status: 'done', text, data: {}, createdAt, ...extra }) satisfies ChatMessage

const chatOf = (title: string, minutes: number, texts: string[], extra: Partial<Chat> = {}): Chat => ({
  ...newChat(minutesAgo(minutes)),
  title,
  messages: texts.map((text, i) => message(i % 2 ? 'assistant' : 'user', text, minutesAgo(minutes + texts.length - i))),
  ...extra,
})

const today = todayIso()
const lisbonBrief = { destinationId: 'lisbon', when: 9, party: 'couple' as const }
const lisbonPlan = (): Plan =>
  makePlan(
    lisbonBrief,
    today,
    destinations,
    newHotels,
    hotels.filter((h) => h.destinationId === 'lisbon'),
  )
const withPlan = (title: string, minutes: number, plan: Plan, extra: Partial<Chat> = {}): Chat => ({
  ...chatOf(title, minutes, ['Лиссабон вдвоём']),
  brief: lisbonBrief,
  ...extra,
  messages: [
    message('user', 'Лиссабон вдвоём', minutesAgo(minutes + 2)),
    message('assistant', 'Записал: Лиссабон.', minutesAgo(minutes + 1), { data: { plan } }),
  ],
})

function renderWith(chats: Chat[]) {
  window.localStorage.setItem(CHATS_KEY, JSON.stringify(chats))
  render(<AssistantSearch newHotels={newHotels} onChoose={push} />)
  return userEvent.setup()
}

const chatList = () => screen.getByRole('navigation', { name: 'Чаты' })
const log = () => screen.getByRole('log', { name: 'Диалог с Эвалом' })
const chatId = () => window.location.pathname.split('/')[2]

// assistant-search, Requirement: Раскладка страницы Эвала
describe('the layout of Eval’s page', () => {
  it('has the chats, the open chat and the right column (Scenario: Компьютер)', async () => {
    const chat = chatOf('Тихий отель', 5, ['Тихий отель в Лиссабоне', 'Записал: Лиссабон.'])
    renderWith([chat])
    expect(await within(log()).findByText('Тихий отель в Лиссабоне')).toBeTruthy()
    expect(window.location.pathname).toBe(`/assistant/${chat.id}`)
    expect(
      within(chatList())
        .getByRole('button', { name: /Тихий отель/ })
        .getAttribute('aria-current'),
    ).toBe('true')
    const aside = screen.getByRole('complementary', { name: 'О поездке' })
    for (const title of ['Параметры поездки', 'Последние запросы', 'Возможности'])
      expect(within(aside).getByRole('heading', { name: title })).toBeTruthy()
    // Only what Eval can do now.
    expect(aside.textContent).not.toMatch(/маршрут|авиабилет|виз/i)
  })

  it('opens a chat at its address and goes back to the list (Scenario: Телефон)', async () => {
    const older = chatOf('Горы', 60, ['В горы'])
    const user = renderWith([chatOf('Море', 5, ['К морю']), older])
    await user.click(await within(chatList()).findByRole('button', { name: /Горы/ }))
    expect(window.location.pathname).toBe(`/assistant/${older.id}`)
    expect(await within(log()).findByText('В горы')).toBeTruthy()

    await user.click(screen.getAllByRole('button', { name: 'Назад к чатам' })[0])
    await waitFor(() => expect(window.location.pathname).toBe('/assistant'))
  })
})

// assistant-search, Requirement: Список чатов
describe('the list of chats', () => {
  it('groups the chats with the time and the start of the last message', async () => {
    const yesterday = new Date(Date.now() - 86_400_000)
    yesterday.setHours(12)
    const old = { ...chatOf('Вчерашний', 0, ['Вчера искал']), updatedAt: yesterday.toISOString() }
    renderWith([chatOf('Сегодняшний', 5, ['Найди тихий отель', 'Записал: тихо ночью.']), old])
    const list = chatList()
    expect(await within(list).findByRole('region', { name: 'Сегодня' })).toBeTruthy()
    const row = within(within(list).getByRole('region', { name: 'Сегодня' })).getByRole('button')
    expect(row.textContent).toContain('Сегодняшний')
    expect(row.textContent).toContain('Записал: тихо ночью.')
    expect(row.textContent).toMatch(/\d\d:\d\d/)
    expect(within(within(list).getByRole('region', { name: 'Вчера' })).getByRole('button').textContent).toContain(
      'Вчерашний',
    )
  })

  it('finds the chats by the title and the messages (Scenario: Поиск)', async () => {
    const user = renderWith([
      chatOf('Отель у моря', 5, ['Валенсия в ноябре, у моря']),
      chatOf('Валенсия на выходные', 10, ['Куда-нибудь']),
      chatOf('Горы', 15, ['Тбилиси']),
    ])
    await within(chatList()).findByRole('button', { name: /Горы/ })
    await user.type(screen.getByLabelText('Поиск чатов'), 'Валенсия')
    const titles = within(chatList())
      .getAllByRole('button', { name: /./ })
      .filter((b) => b.getAttribute('aria-current') !== null)
      .map((b) => b.textContent)
    expect(titles).toHaveLength(2)
    expect(within(chatList()).queryByRole('button', { name: /Горы/ })).toBeNull()
  })
})

// assistant-search, Requirement: Шапка чата
describe('the header of a chat', () => {
  it('renames the chat by the pencil', async () => {
    const user = renderWith([chatOf('Старое имя', 5, ['Привет'])])
    await user.click(await screen.findByRole('button', { name: 'Переименовать чат' }))
    const field = screen.getByLabelText('Название чата')
    await user.clear(field)
    await user.type(field, 'Ноябрь в Лиссабоне{Enter}')
    expect(screen.getByRole('heading', { name: 'Ноябрь в Лиссабоне' })).toBeTruthy()
    expect(within(chatList()).getByRole('button', { name: /Ноябрь в Лиссабоне/ })).toBeTruthy()
  })

  it('shows the guests, the dates and the city of the chat', async () => {
    const plan = lisbonPlan()
    renderWith([withPlan('Лиссабон', 5, plan)])
    expect(await screen.findByText(/^2 гостя · .+ · Лиссабон$/)).toBeTruthy()
  })

  it('deletes the chat after the confirmation and opens the next one (Scenario: Удаление)', async () => {
    const next = chatOf('Второй', 30, ['Второй чат'])
    const user = renderWith([chatOf('Первый', 5, ['Первый чат']), next])
    await within(log()).findByText('Первый чат')
    await user.click(screen.getByRole('button', { name: 'Действия с чатом' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }))
    const dialog = await screen.findByRole('dialog', { name: 'Удалить чат?' })
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(within(chatList()).queryByRole('button', { name: /Первый/ })).toBeNull())
    expect(window.location.pathname).toBe(`/assistant/${next.id}`)
    expect(await within(log()).findByText('Второй чат')).toBeTruthy()
    expect(JSON.parse(window.localStorage.getItem(CHATS_KEY)!)).toHaveLength(1)
  })

  it('offers a guest to sign in to share the chat', async () => {
    const user = renderWith([chatOf('Чат', 5, ['Привет'])])
    await user.click(await screen.findByRole('button', { name: 'Поделиться' }))
    expect(await screen.findByText(/Войдите, чтобы поделиться чатом/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Войти' }).getAttribute('href')).toBe('/login')
  })
})

// assistant-search, Requirement: Параметры поездки
describe('the trip’s parameters', () => {
  it('saves the dates in the chat’s brief and asks by them (Scenario: Правка дат)', async () => {
    const checkIn = addDays(today, 17)
    const checkOut = addDays(today, 22)
    const user = renderWith([withPlan('Лиссабон', 5, lisbonPlan())])
    await within(log()).findByText('Записал: Лиссабон.')
    await user.click(screen.getByRole('button', { name: 'Изменить параметры поездки' }))
    const dialog = await screen.findByRole('dialog', { name: 'Параметры поездки' })
    await user.clear(within(dialog).getByLabelText('Заезд'))
    await user.type(within(dialog).getByLabelText('Заезд'), checkIn)
    await user.clear(within(dialog).getByLabelText('Выезд'))
    await user.type(within(dialog).getByLabelText('Выезд'), checkOut)
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

    const aside = screen.getByRole('complementary', { name: 'О поездке' })
    await waitFor(() => expect(aside.textContent).toContain('5 ночей'))
    fetchMock.mockResolvedValue(answer({ brief: { ...lisbonBrief, dates: { checkIn, checkOut } } }))
    await user.type(screen.getByLabelText('Опишите поездку'), 'покажи ещё{Enter}')
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(bodyOf(0).brief.dates).toEqual({ checkIn, checkOut })
  })

  it('sends a recent request into the open chat (Scenario: Повтор запроса)', async () => {
    fetchMock.mockResolvedValue(answer({ brief: { vibe: 'sea' } }))
    const open = chatOf('Открытый', 5, ['Привет'])
    const user = renderWith([open, chatOf('Другой', 30, ['Тихий отель в Валенсии'])])
    await within(log()).findByText('Привет')
    const aside = screen.getByRole('complementary', { name: 'О поездке' })
    await user.click(within(aside).getByRole('button', { name: 'Тихий отель в Валенсии' }))

    expect(window.location.pathname).toBe(`/assistant/${open.id}`)
    expect(await within(log()).findByText('Тихий отель в Валенсии')).toBeTruthy()
    expect(bodyOf(0).messages.at(-1)).toEqual({ role: 'user', text: 'Тихий отель в Валенсии' })
  })
})

// assistant-search, Requirement: Действия под ответом
describe('the actions under an answer with hotels', () => {
  it('opens /search with the chat’s city, dates and guests (Scenario: Фильтры)', async () => {
    const plan = lisbonPlan()
    const user = renderWith([withPlan('Лиссабон', 5, plan)])
    const actions = await screen.findByRole('group', { name: 'Что дальше' })
    expect(within(actions).getByRole('link', { name: 'Показать на карте' }).getAttribute('href')).toMatch(
      /^\/search\?hotels=.+&from=assistant/,
    )
    expect(within(actions).getByRole('button', { name: 'Изменить даты' })).toBeTruthy()
    await user.click(within(actions).getByRole('button', { name: 'Фильтры' }))
    expect(push).toHaveBeenCalledWith({
      destination: 'Лиссабон',
      checkIn: plan.query.checkIn,
      checkOut: plan.query.checkOut,
      guests: { adults: 2, children: 0, rooms: 1 },
    })
  })

  it('asks for the hotels the chat has not shown on «Другие варианты»', async () => {
    const plan = lisbonPlan()
    fetchMock.mockResolvedValue(
      answer({ brief: lisbonBrief, matches: hotels.filter((h) => h.destinationId === 'lisbon') }),
    )
    const user = renderWith([withPlan('Лиссабон', 5, plan)])
    await user.click(await screen.findByRole('button', { name: 'Другие варианты' }))
    await waitFor(() => expect(within(log()).getAllByText('Атмосфера поездки')).toHaveLength(2))
    const shown = new Set(plan.options.map((o) => o.hotel?.id))
    const cards = within(log()).getAllByRole('list', { name: 'Отели' }).at(-1)!
    for (const card of within(cards).getAllByRole('article'))
      expect([...shown].some((id) => card.querySelector(`#option-${id}`))).toBe(false)
  })
})

// assistant-search, Requirement: Карточки отелей в ответе
describe('the hotel cards of an answer', () => {
  const lisbonHotels = hotels.filter((h) => h.destinationId === 'lisbon')
  const withParking = lisbonHotels.find((h) => getHotel(h.id)!.amenities.includes('parking'))!
  const without = lisbonHotels.find((h) => !getHotel(h.id)!.amenities.some((a) => a.startsWith('parking')))!

  it('shows the rating, the real features, the price for the stay and «Выбрать»', async () => {
    const plan = makePlan(lisbonBrief, today, destinations, newHotels, [withParking], {
      [withParking.id]: { views: [{ roomName: 'Люкс с видом на море', view: 'sea' }] },
    })
    renderWith([withPlan('Лиссабон', 5, plan)])
    const card = await within(log()).findByRole('article', { name: withParking.name })
    expect(await within(card).findByText('Парковка')).toBeTruthy()
    expect(within(card).getByText('Номера с видом на море')).toBeTruthy()
    expect(card.textContent).toMatch(/за \d+ ноч\S* · 2 гостя/)
    expect(
      within(card)
        .getByRole('link', { name: `Выбрать «${withParking.name}»` })
        .getAttribute('href'),
    ).toContain(`/hotels/${withParking.id}?checkin=${plan.query.checkIn}`)
  })

  it('has no lines of features without data (Scenario: Без свойств)', async () => {
    const plan = makePlan(lisbonBrief, today, destinations, newHotels, [without])
    renderWith([withPlan('Лиссабон', 5, plan)])
    const card = await within(log()).findByRole('article', { name: without.name })
    await within(card).findByText(/км от центра/)
    expect(within(card).queryByText(/Парковка/)).toBeNull()
    expect(within(card).queryByText(/с видом/)).toBeNull()
    expect(within(card).getByRole('link', { name: /^Выбрать/ })).toBeTruthy()
  })
})

// assistant-search, Requirement: Голосовой ввод
describe('the voice input', () => {
  it('has no microphone without speech recognition (Scenario: Без поддержки)', async () => {
    renderWith([])
    expect(await screen.findByLabelText('Опишите поездку')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Надиктовать сообщение' })).toBeNull()
  })

  it('puts the dictated words into the field without sending them', async () => {
    let recognition: { onresult: (event: unknown) => void; onend: () => void; lang: string } | undefined
    class FakeRecognition {
      lang = ''
      onresult = () => {}
      onend = () => {}
      constructor() {
        recognition = this as never
      }
      start() {}
      stop() {
        this.onend()
      }
      abort() {}
    }
    ;(window as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = FakeRecognition
    const user = renderWith([])
    await user.click(await screen.findByRole('button', { name: 'Надиктовать сообщение' }))
    expect(recognition?.lang).toBe('ru-RU')
    recognition!.onresult({ results: [Object.assign([{ transcript: 'тихий отель в Валенсии' }], { isFinal: true })] })
    recognition!.onend()
    await waitFor(() =>
      expect((screen.getByLabelText('Опишите поездку') as HTMLTextAreaElement).value).toBe('тихий отель в Валенсии'),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the time under the messages', async () => {
    const chat = chatOf('Чат', 5, ['Привет'])
    renderWith([chat])
    const time = await within(log()).findByText(/^\d\d:\d\d$/)
    expect(time.tagName).toBe('TIME')
  })
})

// assistant-search, Requirement: Поделиться чатом
describe('a shared chat', () => {
  it('shows the messages and the hotel cards without the composer and the list (Scenario: Просмотр по ссылке)', async () => {
    const plan = lisbonPlan()
    const chat = withPlan('Лиссабон', 5, plan)
    render(
      <SharedChat
        share={{
          id: chat.id,
          title: chat.title,
          brief: chat.brief,
          messages: chat.messages,
          createdAt: chat.updatedAt,
        }}
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Лиссабон' })).toBeTruthy()
    expect(within(log()).getByText('Записал: Лиссабон.')).toBeTruthy()
    expect(within(log()).getAllByRole('article').length).toBe(plan.options.length)
    expect(screen.queryByLabelText('Опишите поездку')).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Чаты' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Что дальше' })).toBeNull()
  })
})

// assistant-search, Requirement: История чатов — the chat of an address that is not in the list.
describe('an unknown address', () => {
  it('opens an empty chat of that id, and the first message keeps it', async () => {
    fetchMock.mockResolvedValue(answer({ brief: { vibe: 'sea' } }))
    window.history.replaceState(null, '', '/assistant/5a1e0c3b-0000-4000-8000-000000000001')
    const user = renderWith([chatOf('Другой', 5, ['Привет'])])
    expect(await screen.findByRole('heading', { name: /О каком путешествии вы мечтаете/ })).toBeTruthy()
    await user.type(screen.getByLabelText('Опишите поездку'), 'к морю{Enter}')
    await within(log()).findByText('к морю')
    expect(chatId()).toBe('5a1e0c3b-0000-4000-8000-000000000001')
  })
})

// assistant-search, Requirements: Вопрос об отеле, Пометка непроверенного
describe('a chat about a hotel', () => {
  const hotel = hotels[0]
  const aboutHotel = (): Chat => ({
    ...chatOf(hotel.name, 5, ['Что рядом с отелем?', 'В данных мест рядом нет.']),
    brief: { hotelId: hotel.id, destinationId: hotel.destinationId },
  })
  const withUnverified = (chat: Chat): Chat => ({
    ...chat,
    messages: chat.messages.map((m) =>
      m.role === 'assistant' ? { ...m, data: { unverified: 'Обычно рядом кафе.' } } : m,
    ),
  })

  it('shows the hotel in the header and the unverified part marked (Scenario: Что рядом)', async () => {
    renderWith([withUnverified(aboutHotel())])
    const feed = await within(log()).findByText('Обычно рядом кафе.')
    expect(within(log()).getByText('В данных мест рядом нет.')).toBeTruthy()
    // The mark is in the bubble of the unverified part, not in the one from the data.
    expect(within(feed.parentElement!).getByText('Не проверено')).toBeTruthy()
    expect(within(log()).getAllByText('Не проверено')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: hotel.name })).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Страница отеля' })
    expect(link.getAttribute('href')).toMatch(new RegExp(`^/hotels/${hotel.id}\\?`))
  })

  it('keeps asking about the hotel after «Открыть в Эвале», with no plan or questions (Scenario: Открыть в Эвале)', async () => {
    fetchMock.mockResolvedValue(answer({ brief: { hotelId: hotel.id }, reply: 'Да: парковка.' }))
    const chat = aboutHotel()
    const user = renderWith([chat])
    await within(log()).findByText('В данных мест рядом нет.')
    await user.type(screen.getByLabelText('Опишите поездку'), 'Есть ли парковка?{Enter}')
    expect(await within(log()).findByText('Да: парковка.')).toBeTruthy()
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).brief).toMatchObject({ hotelId: hotel.id })
    expect(chatId()).toBe(chat.id)
    expect(within(log()).queryAllByRole('article')).toHaveLength(0)
    expect(screen.queryByRole('list', { name: 'Быстрые ответы' })).toBeNull()
  })

  it('shows the unverified part in a shared chat too (Scenario: Просмотр по ссылке)', () => {
    const chat = withUnverified(aboutHotel())
    render(
      <SharedChat
        share={{
          id: chat.id,
          title: chat.title,
          brief: chat.brief,
          messages: chat.messages,
          createdAt: chat.updatedAt,
        }}
      />,
    )
    expect(within(log()).getByText('Обычно рядом кафе.')).toBeTruthy()
    expect(within(log()).getByText('Не проверено')).toBeTruthy()
  })
})
