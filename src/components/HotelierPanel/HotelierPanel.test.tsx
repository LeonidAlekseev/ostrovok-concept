import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HotelierConversation, HotelierMessage, HotelierRequest } from '@/lib/hotelierChat'
import { sessionStore } from '@/lib/session'
import { HotelierPanel } from './HotelierPanel'

const remote = vi.hoisted(() => ({
  hotelier: true,
  inbox: [] as HotelierConversation[],
  messages: [] as HotelierMessage[],
  requests: [] as HotelierRequest[],
  onInbox: null as null | ((c: HotelierConversation) => void),
  onMessage: null as null | ((m: HotelierMessage) => void),
  stops: vi.fn(),
  read: vi.fn(async () => {}),
}))
vi.mock('@/lib/supabase/client', () => ({ getBrowserClient: () => ({}) }))
vi.mock('@/lib/hotelierChatRemote', () => ({
  isHotelier: async () => remote.hotelier,
  loadInbox: async () => remote.inbox,
  loadMessages: async () => remote.messages,
  loadRequests: async () => remote.requests,
  markRead: remote.read,
  followInbox: (_client: unknown, on: (c: HotelierConversation) => void) => {
    remote.onInbox = on
    return remote.stops
  },
  followConversation: (_client: unknown, _id: string, on: { message: (m: HotelierMessage) => void }) => {
    remote.onMessage = on.message
    return remote.stops
  },
}))

const fetchMock = vi.fn<typeof fetch>()

const conversation = (id: string, extra: Partial<HotelierConversation> = {}): HotelierConversation => ({
  id,
  hotelId: `ota-${id}`,
  hotelName: `Hotel ${id}`,
  kind: 'user',
  status: 'open',
  lastMessageAt: `2026-10-28T10:0${id}:00Z`,
  lastMessageText: `Вопрос ${id}`,
  lastSender: 'user',
  userUnread: 0,
  hotelierUnread: 1,
  createdAt: '2026-10-28T10:00:00Z',
  ...extra,
})
const message = (id: string, sender: HotelierMessage['sender'], text: string): HotelierMessage => ({
  id,
  conversationId: '2',
  sender,
  text,
  requestId: null,
  shareable: false,
  readAt: null,
  createdAt: `2026-10-28T10:0${id.length}:00Z`,
})

beforeEach(() => {
  remote.hotelier = true
  remote.inbox = [
    conversation('1'),
    conversation('2', { kind: 'ai_request', status: 'waiting_hotelier', lastSender: 'ai_assistant' }),
  ]
  remote.messages = [message('m', 'ai_assistant', 'Есть ли балкон в номерах Deluxe?')]
  remote.requests = [
    {
      id: 'r1',
      conversationId: '2',
      hotelId: 'ota-2',
      question: 'Есть ли балкон в номерах Deluxe?',
      characteristicKeys: ['room.balcony'],
      contextSummary: 'Гость ищет номер с балконом',
      status: 'pending',
      answeredAt: null,
      createdAt: '2026-10-28T10:00:00Z',
    },
  ]
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  act(() => sessionStore.set(null))
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  remote.stops.mockReset()
  remote.read.mockClear()
})

const signIn = () => act(() => sessionStore.set({ name: 'Демо отельер', email: 'hotelier@example.com' }))

describe('HotelierPanel', () => {
  it('asks to sign in, and shows nothing to a user who is not a hotelier', async () => {
    const { unmount } = render(<HotelierPanel />)
    expect(screen.getByRole('link', { name: 'Войти' }).getAttribute('href')).toBe('/login?next=%2Fhotelier')
    unmount()
    remote.hotelier = false
    signIn()
    render(<HotelierPanel />)
    expect(await screen.findByText(/нет доступа к отелям/)).toBeDefined()
    expect(screen.queryByRole('list', { name: 'Обращения' })).toBeNull()
  })

  it('lists the conversations newest first with the initiator, state and unread, and filters them', async () => {
    signIn()
    render(<HotelierPanel />)
    const user = userEvent.setup()
    const list = await screen.findByRole('list', { name: 'Обращения' })
    const rows = within(list).getAllByRole('button')
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Hotel 2'),
      expect.stringContaining('Hotel 1'),
    ])
    expect(rows[0].textContent).toContain('Эвал')
    expect(rows[0].textContent).toContain('Ждёт отельера')
    expect(rows[1].textContent).toContain('Гость: Вопрос 1')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Инициатор' }), 'user')
    expect(within(list).getAllByRole('button')).toHaveLength(1)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Инициатор' }), '')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Отель' }), 'ota-2')
    expect(
      within(list)
        .getAllByRole('button')
        .map((r) => r.textContent),
    ).toEqual([expect.stringContaining('Hotel 2')])
  })

  it('puts a conversation that comes by Realtime first, keeping its hotel name', async () => {
    signIn()
    render(<HotelierPanel />)
    const list = await screen.findByRole('list', { name: 'Обращения' })
    act(() => remote.onInbox!({ ...conversation('1', { lastMessageAt: '2026-10-28T11:00:00Z' }), hotelName: null }))
    expect(within(list).getAllByRole('button')[0].textContent).toContain('Hotel 1')
  })

  it('opens Эвал’s request with its characteristics, reads it and answers it, shared', async () => {
    signIn()
    render(<HotelierPanel />)
    const user = userEvent.setup()
    await user.click(within(await screen.findByRole('list', { name: 'Обращения' })).getAllByRole('button')[0])
    const request = await screen.findByRole('region', { name: 'Запрос Эвала' })
    expect(within(request).getByText('room.balcony')).toBeDefined()
    expect(within(request).getByText('Гость ищет номер с балконом')).toBeDefined()
    await waitFor(() => expect(remote.read).toHaveBeenCalledWith({}, '2'))
    expect(screen.getByRole('checkbox', { name: /общих сведениях/ }).getAttribute('aria-checked')).toBe('true')

    fetchMock.mockResolvedValueOnce(Response.json(message('mm', 'hotelier', 'Да, на 4–5 этажах')))
    await user.type(screen.getByRole('textbox', { name: 'Ответ гостю' }), 'Да, на 4–5 этажах')
    await user.click(screen.getByRole('button', { name: 'Ответить' }))
    const log = screen.getByRole('log', { name: 'История переписки' })
    expect(await within(log).findByText('Да, на 4–5 этажах')).toBeDefined()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/hotelier/conversations/2/messages')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      text: 'Да, на 4–5 этажах',
      shareable: true,
      requestId: 'r1',
    })
  })

  it('shows the guest’s message that comes while the chat is open, as «Гость», and resolves the chat', async () => {
    signIn()
    render(<HotelierPanel />)
    const user = userEvent.setup()
    await user.click(within(await screen.findByRole('list', { name: 'Обращения' })).getAllByRole('button')[1])
    await waitFor(() => expect(remote.onMessage).not.toBeNull())
    act(() => remote.onMessage!({ ...message('g', 'user', 'А вид на море?'), conversationId: '1' }))
    const log = screen.getByRole('log', { name: 'История переписки' })
    expect(within(log).getAllByText('Гость').length).toBeGreaterThan(0)
    // A user chat's answer is private unless the hotelier ticks the box.
    expect(screen.getByRole('checkbox', { name: /общих сведениях/ }).getAttribute('aria-checked')).toBe('false')

    fetchMock.mockResolvedValueOnce(Response.json(conversation('1', { status: 'resolved', hotelierUnread: 0 })))
    await user.click(screen.getByRole('button', { name: 'Решено' }))
    expect(await screen.findByRole('button', { name: 'Открыть снова' })).toBeDefined()
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ status: 'resolved' })
  })
})
