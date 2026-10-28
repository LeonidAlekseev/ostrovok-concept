import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HotelierConversation, HotelierMessage } from '@/lib/hotelierChat'
import { sessionStore } from '@/lib/session'
import { HotelierChat, HotelierChatProvider, HotelierUnread } from './HotelierChat'

const remote = vi.hoisted(() => ({
  conversation: null as HotelierConversation | null,
  messages: [] as HotelierMessage[],
  on: null as null | { message: (m: HotelierMessage) => void; conversation: (c: HotelierConversation) => void },
  stop: vi.fn(),
  read: vi.fn(async () => {}),
}))
vi.mock('@/lib/supabase/client', () => ({ getBrowserClient: () => ({}) }))
vi.mock('@/lib/hotelierChatRemote', () => ({
  loadHotelChat: async () => remote.conversation,
  loadMessages: async () => remote.messages,
  markRead: remote.read,
  followConversation: (_client: unknown, _id: string, on: typeof remote.on) => {
    remote.on = on
    return remote.stop
  },
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/hotels/ota-1' }))

const fetchMock = vi.fn<typeof fetch>()

const conversation = (extra: Partial<HotelierConversation> = {}): HotelierConversation => ({
  id: 'c1',
  hotelId: 'ota-1',
  hotelName: null,
  kind: 'user',
  status: 'open',
  lastMessageAt: '2026-10-28T10:00:00Z',
  lastMessageText: '',
  lastSender: null,
  userUnread: 0,
  hotelierUnread: 0,
  createdAt: '2026-10-28T10:00:00Z',
  ...extra,
})
const message = (id: string, sender: HotelierMessage['sender'], text: string): HotelierMessage => ({
  id,
  conversationId: 'c1',
  sender,
  text,
  requestId: null,
  shareable: false,
  knowledgeRevokedAt: null,
  readAt: null,
  createdAt: `2026-10-28T10:0${id.length}:00Z`,
})

function renderChat(visible = true) {
  return render(
    <HotelierChatProvider hotelId="ota-1">
      <span data-testid="tab">
        Отельер
        <HotelierUnread />
      </span>
      <HotelierChat visible={visible} />
    </HotelierChatProvider>,
  )
}

beforeEach(() => {
  remote.conversation = null
  remote.messages = []
  remote.on = null
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  act(() => sessionStore.set(null))
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  remote.stop.mockReset()
  remote.read.mockClear()
})

const signIn = () => act(() => sessionStore.set({ name: 'Анна', email: 'anna@example.com' }))

describe('HotelierChat', () => {
  it('asks a guest to sign in and back to the hotel', () => {
    renderChat()
    expect(screen.getByRole('link', { name: 'Войти' }).getAttribute('href')).toBe('/login?next=%2Fhotels%2Fota-1')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('writes the first message, shows it and follows the new chat', async () => {
    signIn()
    renderChat()
    const user = userEvent.setup()
    const field = await screen.findByRole('textbox', { name: 'Сообщение отельеру' })
    fetchMock.mockResolvedValueOnce(
      Response.json({ conversation: conversation(), message: message('m', 'user', 'Есть балкон?') }),
    )
    await user.type(field, 'Есть балкон?')
    await user.click(screen.getByRole('button', { name: 'Отправить отельеру' }))
    expect(await screen.findByText('Есть балкон?')).toBeDefined()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/hotels/ota-1/hotelier/messages')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ text: 'Есть балкон?' })
    await waitFor(() => expect(remote.on).not.toBeNull())
    expect((field as HTMLInputElement).value).toBe('')
  })

  it('restores the history, gets the hotelier’s answer by Realtime and reads it', async () => {
    signIn()
    remote.conversation = conversation()
    remote.messages = [message('m', 'user', 'Есть балкон?')]
    renderChat()
    const log = await screen.findByRole('log', { name: 'Чат с отельером' })
    expect(within(log).getByText('Есть балкон?')).toBeDefined()
    await waitFor(() => expect(remote.on).not.toBeNull())
    act(() => {
      remote.on!.message(message('mm', 'hotelier', 'Да, на 4–5 этажах'))
      remote.on!.conversation(conversation({ userUnread: 1 }))
    })
    expect(within(log).getByText('Да, на 4–5 этажах')).toBeDefined()
    expect(within(log).getByText('Отельер')).toBeDefined()
    await waitFor(() => expect(remote.read).toHaveBeenCalledWith({}, 'c1'))
  })

  it('counts the unread answers while the tab is hidden', async () => {
    signIn()
    remote.conversation = conversation({ userUnread: 2 })
    renderChat(false)
    expect(await within(screen.getByTestId('tab')).findByText('2')).toBeDefined()
    expect(remote.read).not.toHaveBeenCalled()
  })

  it('says why a message was refused and keeps the draft', async () => {
    signIn()
    renderChat()
    const user = userEvent.setup()
    const field = await screen.findByRole('textbox', { name: 'Сообщение отельеру' })
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'x' }, { status: 429 }))
    await user.type(field, 'Ещё вопрос')
    await user.click(screen.getByRole('button', { name: 'Отправить отельеру' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Слишком много сообщений: подождите минуту')
    expect((field as HTMLInputElement).value).toBe('Ещё вопрос')
  })

  it('stops following the chat when it goes', async () => {
    signIn()
    remote.conversation = conversation()
    const { unmount } = renderChat()
    await waitFor(() => expect(remote.on).not.toBeNull())
    unmount()
    expect(remote.stop).toHaveBeenCalledTimes(1)
  })
})
