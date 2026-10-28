import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays } from '@/lib/dates'
import { sessionStore } from '@/lib/session'
import { bookingsStore, saveBooking } from '@/lib/storage'
import { BookingDetailsPage } from './BookingDetailsPage'
import { makeBooking } from './testBooking'
import { TripsPage } from './TripsPage'
import { waitForCatalog } from '@/test/waitForCatalog'

const nav = vi.hoisted(() => ({ query: '', push: vi.fn() }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  usePathname: () => '/trips',
  useRouter: () => ({ replace: vi.fn(), push: nav.push }),
}))

const fetchMock = vi.fn<typeof fetch>()
/** The body of the `n`-th request to Эвал. */
const bodyOf = (n: number) =>
  JSON.parse(fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/assistant'))[n][1]?.body as string)

/** Эвал's answer to the requests to it. */
function reply(body: object) {
  const catalog = fetchMock.getMockImplementation()!
  fetchMock.mockImplementation((input, init) =>
    String(input).includes('/api/assistant') ? Promise.resolve(Response.json(body)) : catalog(input, init),
  )
}

beforeEach(() => {
  nav.query = ''
  sessionStore.set({ name: 'Анна Петрова', email: 'anna@example.com' })
  // The "thinking" pause of Эвал does not wait in real time.
  const realSetTimeout = globalThis.setTimeout
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
    realSetTimeout(handler, ms === 650 ? 0 : ms, ...args)) as typeof setTimeout)
  // The catalogue's requests go on as the setup serves them; the assistant's are answered here.
  const catalog = globalThis.fetch
  fetchMock.mockImplementation((input, init) => catalog(input, init))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  localStorage.clear()
})

// trips, Requirement: Новое бронирование в поездках
describe('TripsPage after booking', () => {
  it('shows the new booking first, marked, with its number', async () => {
    saveBooking(makeBooking('OS-SOON01', 5))
    saveBooking(makeBooking('OS-NEW001', 30))
    nav.query = 'new=OS-NEW001'
    render(<TripsPage />)
    await waitForCatalog()
    expect(screen.getByRole('status').textContent).toBe('Бронирование OS-NEW001 подтверждено')
    const cards = within(screen.getByRole('tabpanel')).getAllByRole('link')
    expect(cards[0].getAttribute('href')).toBe('/trips/booking?id=OS-NEW001')
    expect(cards[0].getAttribute('aria-current')).toBe('true')
    expect(within(cards[0]).getByText('Новое')).toBeTruthy()
    expect(cards[1].getAttribute('aria-current')).toBeNull()
  })
})

// trips, Requirement: Эвал в поездках; Requirement: Смена дат с Эвалом
describe('Эвал on the booking page', () => {
  const booking = makeBooking('OS-UP0001', 7)
  const newIn = addDays(booking.checkIn, 7)
  const newOut = addDays(newIn, 2)
  const change = {
    bookingId: booking.id,
    from: { checkIn: booking.checkIn, checkOut: booking.checkOut, total: booking.total },
    checkIn: newIn,
    checkOut: newOut,
    total: 23000,
    cancellation: { kind: 'free', daysBefore: 2 },
  }

  it('knows the booking, sends it without personal data and changes the dates only on «Подтвердить»', async () => {
    const user = userEvent.setup()
    saveBooking(booking)
    nav.query = `id=${booking.id}`
    reply({
      source: 'rules',
      brief: { trips: true, bookingId: booking.id },
      reply: 'Могу перенести. Даты изменятся, только когда вы нажмёте «Подтвердить».',
      change,
    })
    render(<BookingDetailsPage />)
    await waitForCatalog()
    await user.click(screen.getByRole('button', { name: 'Изменить даты с Эвалом' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText(`Помощник по бронированию ${booking.id}`)).toBeTruthy()
    await waitFor(() =>
      expect(within(panel).getByRole('button', { name: 'Хочу изменить даты' })).toHaveProperty('disabled', false),
    )
    await user.type(within(panel).getByRole('textbox', { name: 'Вопрос о поездках' }), 'Перенеси на неделю позже')
    await user.click(within(panel).getByRole('button', { name: 'Отправить' }))

    const card = await within(panel).findByRole('region', { name: `Перенос бронирования ${booking.id}` })
    const sent = bodyOf(0)
    expect(sent.brief).toEqual({ trips: true, bookingId: booking.id })
    expect(sent.bookings).toHaveLength(1)
    expect(sent.bookings[0]).toMatchObject({ id: booking.id, total: booking.total })
    expect(JSON.stringify(sent.bookings)).not.toMatch(/Анна|anna@example\.com|roomGuests|contact/)
    // Proposed only: the booking keeps its dates until the traveller confirms.
    expect(within(card).getByText(/23 000/)).toBeTruthy()
    expect(bookingsStore.get()[0]).toMatchObject({ checkIn: booking.checkIn, total: booking.total })

    await user.click(within(card).getByRole('button', { name: 'Подтвердить' }))
    expect(within(card).getByRole('status').textContent).toBe('Даты изменены')
    expect(bookingsStore.get()[0]).toMatchObject({ checkIn: newIn, checkOut: newOut, total: 23000 })
    expect(within(card).queryByRole('button', { name: 'Подтвердить' })).toBeNull()
  })

  it('outdates the proposal of a booking changed since it was counted', async () => {
    const user = userEvent.setup()
    saveBooking(booking)
    nav.query = `id=${booking.id}`
    reply({ source: 'rules', brief: { trips: true, bookingId: booking.id }, reply: 'Могу перенести.', change })
    render(<BookingDetailsPage />)
    await waitForCatalog()
    await user.click(screen.getByRole('button', { name: 'Спросить Эвала' }))
    const panel = await screen.findByRole('dialog')
    await waitFor(() =>
      expect(within(panel).getByRole('button', { name: 'Хочу изменить даты' })).toHaveProperty('disabled', false),
    )
    await user.click(within(panel).getByRole('button', { name: 'Хочу изменить даты' }))
    const card = await within(panel).findByRole('region', { name: `Перенос бронирования ${booking.id}` })
    saveBooking({ ...booking, total: 99_000 })
    await user.click(within(card).getByRole('button', { name: 'Подтвердить' }))
    expect(within(card).getByRole('status').textContent).toMatch(/изменилось после расчёта/)
    expect(bookingsStore.get()[0]).toMatchObject({ checkIn: booking.checkIn, total: 99_000 })
  })
})
