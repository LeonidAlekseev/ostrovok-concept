import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHATS_KEY, newChat, type Chat } from '@/lib/assistantChats'
import { getHotel } from '@/lib/catalogGenerator'
import { HotelPage } from './HotelPage'

const nav = vi.hoisted(() => ({ query: '' }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  usePathname: () => '/hotels/x',
  useRouter: () => ({ replace: vi.fn() }),
}))

const hotel = getHotel('prague-old-town-lantern')!
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 20, 12))
  nav.query = ''
  // The "thinking" pause of Эвал does not wait in real time.
  const realSetTimeout = globalThis.setTimeout
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
    realSetTimeout(handler, ms === 650 ? 0 : ms, ...args)) as typeof setTimeout)
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  window.localStorage.clear()
})

const reply = (body: object) =>
  fetchMock.mockResolvedValue(Response.json({ source: 'rules', brief: { hotelId: hotel.id }, ...body }))
const card = () => screen.getByRole('region', { name: 'Эвал' })
const saved = (): Chat[] => JSON.parse(window.localStorage.getItem(CHATS_KEY) ?? '[]')
const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1]?.body as string)

function renderPage() {
  const result = render(<HotelPage hotel={hotel} />)
  return { ...result, user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime }) }
}

// hotel-page, Requirement: Помощник на странице отеля
describe('HotelAssistant', () => {
  it('shows Эвал with the greeting, the four questions and the field (Scenario: Телефон / компьютер)', () => {
    renderPage()
    const c = within(card())
    expect(c.getByText(/Привет! Я Эвал/)).toBeDefined()
    const questions = c.getByRole('list', { name: 'Готовые вопросы' })
    expect(
      within(questions)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Какие номера есть?', 'Что рядом с отелем?', 'Есть ли парковка?', 'Можно с питомцами?'])
    expect(c.getByPlaceholderText('Задайте любой вопрос…')).toBeDefined()
    // Nothing to open until the first question.
    expect(c.queryByRole('link', { name: 'Открыть в Эвале' })).toBeNull()
  })

  it('answers a ready-made question in the card and saves the chat of the hotel (Scenario: Готовый вопрос)', async () => {
    reply({ reply: 'Да: парковка.' })
    const { user } = renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Есть ли парковка?' })).toHaveProperty('disabled', false),
    )
    await user.click(screen.getByRole('button', { name: 'Есть ли парковка?' }))
    const log = await within(card()).findByRole('log', { name: 'Диалог с Эвалом' })
    expect(await within(log).findByText('Да: парковка.')).toBeDefined()
    expect(within(log).getByText('Есть ли парковка?')).toBeDefined()
    // The request is about this hotel, the chat is named after it (Scenario: В списке чатов).
    expect(bodyOf(0).brief).toMatchObject({ hotelId: hotel.id })
    await waitFor(() => expect(saved()).toHaveLength(1))
    expect(saved()[0]).toMatchObject({ title: hotel.name, brief: { hotelId: hotel.id } })
  })

  it('sends a free question and marks the model’s own part «Не проверено» (Scenario: Что рядом)', async () => {
    reply({ reply: 'В данных мест нет.', unverified: 'Обычно рядом есть кафе.', source: 'model' })
    const { user } = renderPage()
    await waitFor(() => expect(screen.getByPlaceholderText('Задайте любой вопрос…')).toBeDefined())
    await user.type(screen.getByLabelText('Вопрос об отеле'), 'Что поесть неподалёку?{Enter}')
    const log = await within(card()).findByRole('log', { name: 'Диалог с Эвалом' })
    expect(await within(log).findByText('Обычно рядом есть кафе.')).toBeDefined()
    expect(within(log).getByText('Не проверено')).toBeDefined()
    expect(bodyOf(0).messages.at(-1)).toEqual({ role: 'user', text: 'Что поесть неподалёку?' })
    expect(screen.getByLabelText<HTMLInputElement>('Вопрос об отеле').value).toBe('')
  })

  it('sends the page’s dates with the question', async () => {
    nav.query = 'checkin=2026-11-10&checkout=2026-11-12&adults=2&rooms=1'
    reply({ reply: 'Вот номера.' })
    const { user } = renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Какие номера есть?' })).toHaveProperty('disabled', false),
    )
    await user.click(screen.getByRole('button', { name: 'Какие номера есть?' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(bodyOf(0).brief.dates).toEqual({ checkIn: '2026-11-10', checkOut: '2026-11-12' })
  })

  it('opens the chat in Эвал (Scenario: Открыть в Эвале)', async () => {
    reply({ reply: 'Да: парковка.' })
    const { user } = renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Есть ли парковка?' })).toHaveProperty('disabled', false),
    )
    await user.click(screen.getByRole('button', { name: 'Есть ли парковка?' }))
    const link = await within(card()).findByRole('link', { name: 'Открыть в Эвале' })
    await waitFor(() => expect(saved()).toHaveLength(1))
    expect(link.getAttribute('href')).toBe(`/assistant/${saved()[0].id}`)
  })

  it('continues the hotel’s last chat on the next visit (Scenario: Возврат на страницу отеля)', async () => {
    const chat: Chat = {
      ...newChat('2026-10-19T10:00:00.000Z'),
      title: hotel.name,
      brief: { hotelId: hotel.id },
      messages: [
        {
          id: 'u',
          role: 'user',
          status: 'done',
          text: 'Есть ли парковка?',
          data: {},
          createdAt: '2026-10-19T10:00:00.000Z',
        },
        {
          id: 'a',
          role: 'assistant',
          status: 'done',
          text: 'Да: парковка.',
          data: {},
          createdAt: '2026-10-19T10:00:01.000Z',
        },
      ],
    }
    window.localStorage.setItem(CHATS_KEY, JSON.stringify([chat]))
    reply({ reply: 'Питомцы можно.' })
    const { user } = renderPage()
    const log = await within(card()).findByRole('log', { name: 'Диалог с Эвалом' })
    expect(within(log).getByText('Да: парковка.')).toBeDefined()
    expect(within(card()).getByRole('link', { name: 'Открыть в Эвале' }).getAttribute('href')).toBe(
      `/assistant/${chat.id}`,
    )
    await user.click(screen.getByRole('button', { name: 'Можно с питомцами?' }))
    expect(await within(log).findByText('Питомцы можно.')).toBeDefined()
    // The same chat grew; no second one.
    await waitFor(() => expect(saved()).toHaveLength(1))
    expect(saved()[0].id).toBe(chat.id)
    expect(bodyOf(0).messages.map((m: { text: string }) => m.text)).toEqual([
      'Есть ли парковка?',
      'Да: парковка.',
      'Можно с питомцами?',
    ])
  })
})
