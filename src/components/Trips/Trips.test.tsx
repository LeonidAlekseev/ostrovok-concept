import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sessionStore } from '@/lib/session'
import { bookingsStore, saveBooking } from '@/lib/storage'
import { setProduction } from '@/test/env'
import { BookingDetailsPage } from './BookingDetailsPage'
import { makeBooking } from './testBooking'
import { TripsPage } from './TripsPage'
import { waitForCatalog } from '@/test/waitForCatalog'

const nav = vi.hoisted(() => ({ query: '' }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.query) }))

const signIn = () => sessionStore.set({ name: 'Анна Петрова', email: 'anna@example.com' })

afterEach(() => localStorage.clear())

// trips
describe('TripsPage', () => {
  it('asks a guest to sign in and returns to /trips', async () => {
    render(<TripsPage />)
    await waitForCatalog()
    expect(screen.getByText('Войдите, чтобы увидеть поездки')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Войти' }).getAttribute('href')).toBe('/login?next=%2Ftrips')
  })

  it('lists an upcoming trip in the first tab with a link to its details', async () => {
    signIn()
    saveBooking(makeBooking('OS-UP0001', 7))
    saveBooking(makeBooking('OS-PAST01', -10))
    saveBooking(makeBooking('OS-CANC01', 7, { status: 'cancelled' }))
    render(<TripsPage />)
    await waitForCatalog()
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByText('Бронирование OS-UP0001')).toBeTruthy()
    expect(within(panel).queryByText('Бронирование OS-PAST01')).toBeNull()
    expect(within(panel).getByRole('link').getAttribute('href')).toBe('/trips/booking?id=OS-UP0001')
  })

  // trips, Requirement: Список поездок, Scenario: Без планов
  it('shows the bookings only, without «Мои планы»', async () => {
    signIn()
    render(<TripsPage />)
    await waitForCatalog()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.queryByText('Мои планы')).toBeNull()
    expect(document.querySelector('a[href^="/trip/"]')).toBeNull()
  })

  it('shows past and cancelled trips in their tabs', async () => {
    const user = userEvent.setup()
    signIn()
    saveBooking(makeBooking('OS-PAST01', -10))
    saveBooking(makeBooking('OS-CANC01', 7, { status: 'cancelled' }))
    render(<TripsPage />)
    await waitForCatalog()
    await user.click(screen.getByRole('tab', { name: /Завершённые/ }))
    expect(screen.getByText('Бронирование OS-PAST01')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: /Отменённые/ }))
    expect(screen.getByText('Бронирование OS-CANC01')).toBeTruthy()
  })

  it('shows a message and a search link in an empty tab', async () => {
    signIn()
    render(<TripsPage />)
    await waitForCatalog()
    expect(screen.getByText('Предстоящих поездок пока нет')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Найти отель' }).getAttribute('href')).toBe('/')
  })
})

describe('BookingDetailsPage', () => {
  it('asks a guest to sign in and returns to the booking', () => {
    nav.query = 'id=OS-UP0001'
    render(<BookingDetailsPage />)
    expect(screen.getByRole('link', { name: 'Войти' }).getAttribute('href')).toBe(
      '/login?next=' + encodeURIComponent('/trips/booking?id=OS-UP0001'),
    )
  })

  it('says the booking is not found for an unknown number', () => {
    signIn()
    nav.query = 'id=OS-NOPE00'
    render(<BookingDetailsPage />)
    expect(screen.getByRole('heading', { name: 'Бронирование не найдено' })).toBeTruthy()
  })

  it('shows the order information', () => {
    signIn()
    saveBooking(makeBooking('OS-UP0001', 7))
    nav.query = 'id=OS-UP0001'
    render(<BookingDetailsPage />)
    expect(screen.getByRole('heading', { name: 'Бронирование OS-UP0001' })).toBeTruthy()
    expect(screen.getByText('anna@example.com, +7 900 123-45-67')).toBeTruthy()
    expect(screen.getByText('Оплата в отеле при заселении')).toBeTruthy()
    expect(screen.getByText(/Бесплатная отмена до/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Напишите в поддержку' }).getAttribute('href')).toBe('/help')
  })

  it('cancels for free before the free-cancellation date', async () => {
    const user = userEvent.setup()
    signIn()
    saveBooking(makeBooking('OS-UP0001', 7))
    nav.query = 'id=OS-UP0001'
    render(<BookingDetailsPage />)
    await user.click(screen.getByRole('button', { name: 'Отменить бронирование' }))
    expect(screen.getByText('Бесплатно')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Подтвердить отмену' }).className).toContain('bg-destructive')
    await user.click(screen.getByRole('button', { name: 'Подтвердить отмену' }))
    expect(bookingsStore.get()[0]).toMatchObject({ status: 'cancelled', cancellationFee: 0 })
    expect(screen.getByText(/Бронирование отменено/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Изменить данные' })).toBeNull()
  })

  it('withholds the whole amount for a non-refundable rate', async () => {
    const user = userEvent.setup()
    signIn()
    saveBooking(makeBooking('OS-UP0001', 7, { cancellation: { kind: 'non-refundable' } }))
    nav.query = 'id=OS-UP0001'
    render(<BookingDetailsPage />)
    await user.click(screen.getByRole('button', { name: 'Отменить бронирование' }))
    expect(screen.getByText(/Удержание: 20\s000 ₽/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Подтвердить отмену' }))
    expect(bookingsStore.get()[0].cancellationFee).toBe(20000)
  })

  it('does not offer changes for a past trip', () => {
    signIn()
    saveBooking(makeBooking('OS-PAST01', -10))
    nav.query = 'id=OS-PAST01'
    render(<BookingDetailsPage />)
    expect(screen.queryByRole('button', { name: 'Отменить бронирование' })).toBeNull()
  })

  it('saves a new phone and confirms it', async () => {
    const user = userEvent.setup()
    signIn()
    saveBooking(makeBooking('OS-UP0001', 7))
    nav.query = 'id=OS-UP0001'
    render(<BookingDetailsPage />)
    await user.click(screen.getByRole('button', { name: 'Изменить данные' }))
    const phone = screen.getByLabelText('Телефон')
    await user.clear(phone)
    await user.type(phone, '+7 911 000-11-22')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(screen.getByText('Изменения сохранены')).toBeTruthy()
    expect(screen.getByText('anna@example.com, +7 911 000-11-22')).toBeTruthy()
  })

  it('does not save an invalid phone', async () => {
    const user = userEvent.setup()
    signIn()
    saveBooking(makeBooking('OS-UP0001', 7))
    nav.query = 'id=OS-UP0001'
    render(<BookingDetailsPage />)
    await user.click(screen.getByRole('button', { name: 'Изменить данные' }))
    await user.clear(screen.getByLabelText('Телефон'))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(screen.getByText('Введите телефон')).toBeTruthy()
    expect(bookingsStore.get()[0].contact.phone).toBe('+7 900 123-45-67')
  })
})

// hotel-catalog, Requirement: Синтетические отели только вне production
describe('TripsPage in production', () => {
  it('lists a booking of a synthetic hotel without an error', async () => {
    setProduction(true)
    signIn()
    saveBooking(makeBooking('OS-UP0001', 7))
    render(<TripsPage />)
    await waitForCatalog()
    expect(within(screen.getByRole('tabpanel')).getByText('Бронирование OS-UP0001')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
