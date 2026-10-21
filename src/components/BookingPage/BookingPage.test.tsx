import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHotel } from '@/lib/catalog'
import { addDays, todayIso } from '@/lib/dates'
import { toOfferParams } from '@/lib/offer'
import { sessionStore } from '@/lib/session'
import { bookingsStore } from '@/lib/storage'
import { BookingPage } from './BookingPage'

const nav = vi.hoisted(() => ({ query: '', replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ replace: nav.replace }),
}))

const hotel = getHotel('prague-old-town-lantern')!
const room = hotel.rooms[0]
const nowRate = room.rates.find((r) => r.payment === 'now')!
const hotelRate = room.rates.find((r) => r.payment === 'at-hotel')!
const checkIn = addDays(todayIso(), 20)
const offerQuery = (rateId: string, rooms = 1) =>
  toOfferParams({
    hotelId: hotel.id,
    roomId: room.id,
    rateId,
    checkIn,
    checkOut: addDays(checkIn, 3),
    guests: { adults: 2 * rooms, children: 0, rooms },
  }).toString()

beforeEach(() => {
  nav.replace.mockClear()
})
afterEach(() => localStorage.clear())

// booking-checkout, Requirement: Сводка заказа
describe('BookingPage summary', () => {
  it('shows the order and its total', () => {
    nav.query = offerQuery(nowRate.id)
    render(<BookingPage />)
    expect(screen.getByRole('heading', { name: 'Оформление бронирования' })).toBeTruthy()
    const summary = screen.getByRole('complementary')
    expect(summary.textContent).toContain(hotel.name)
    expect(summary.textContent).toContain(room.name)
    expect(summary.textContent).toContain('3 ночи')
    expect(summary.textContent).toContain('Оплата сейчас')
  })

  it('says the offer is not found for an unknown rate', () => {
    nav.query = offerQuery('nope')
    render(<BookingPage />)
    expect(screen.getByRole('heading', { name: 'Предложение не найдено' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Найти отель' }).getAttribute('href')).toBe('/#search')
  })
})

// booking-checkout, Requirement: Данные гостей и контакты
describe('BookingPage form', () => {
  it('shows errors and focuses the first invalid field on an empty form', async () => {
    nav.query = offerQuery(hotelRate.id)
    render(<BookingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Забронировать' }))
    expect(screen.getByText('Введите имя')).toBeTruthy()
    expect(screen.getByText('Введите фамилию')).toBeTruthy()
    expect(screen.getByText('Введите email')).toBeTruthy()
    expect(screen.getByText('Введите телефон')).toBeTruthy()
    expect(screen.getByText('Подтвердите согласие с условиями')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText('Имя'))
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it('focuses the consent box when it is the only error', async () => {
    nav.query = offerQuery(hotelRate.id)
    render(<BookingPage />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Имя'), 'Анна')
    await user.type(screen.getByLabelText('Фамилия'), 'Петрова')
    await user.type(screen.getByLabelText('Email'), 'anna@example.com')
    await user.type(screen.getByLabelText('Телефон'), '+7 900 123-45-67')
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))
    expect(document.activeElement).toBe(screen.getByRole('checkbox'))
  })

  it('asks for the main guest of every room', () => {
    nav.query = offerQuery(hotelRate.id, 2)
    render(<BookingPage />)
    expect(screen.getAllByLabelText('Имя')).toHaveLength(2)
    expect(screen.getByText('Номер 2: основной гость')).toBeTruthy()
  })

  it('fills the first guest and email from the session', () => {
    sessionStore.set({ name: 'Анна Петрова', email: 'anna@example.com' })
    nav.query = offerQuery(hotelRate.id)
    render(<BookingPage />)
    expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Анна')
    expect((screen.getByLabelText('Фамилия') as HTMLInputElement).value).toBe('Петрова')
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('anna@example.com')
  })
})

// booking-checkout, Requirement: Демо-оплата
describe('BookingPage payment', () => {
  it('shows the card form and the demo note for "Оплата сейчас"', () => {
    nav.query = offerQuery(nowRate.id)
    render(<BookingPage />)
    expect(screen.getByLabelText('Номер карты')).toBeTruthy()
    expect(screen.getByText(/деньги не списываются/)).toBeTruthy()
    expect(screen.queryByText('Оплата в отеле при заселении')).toBeNull()
  })

  it('has no card fields for "Оплата в отеле"', () => {
    nav.query = offerQuery(hotelRate.id)
    render(<BookingPage />)
    expect(screen.queryByLabelText('Номер карты')).toBeNull()
    expect(screen.getByText('Оплата в отеле при заселении')).toBeTruthy()
    expect(screen.getByText(/деньги не списываются/)).toBeTruthy()
  })

  it('rejects a card number that fails Luhn', async () => {
    nav.query = offerQuery(nowRate.id)
    render(<BookingPage />)
    await userEvent.type(screen.getByLabelText('Номер карты'), '4242424242424241')
    await userEvent.click(screen.getByRole('button', { name: 'Забронировать' }))
    expect(screen.getByText('Проверьте номер карты')).toBeTruthy()
  })
})

// booking-checkout, Requirement: Отправка бронирования
describe('BookingPage submit', () => {
  it('stores the booking without card data and replaces the address', async () => {
    nav.query = offerQuery(nowRate.id)
    render(<BookingPage />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Имя'), 'Анна')
    await user.type(screen.getByLabelText('Фамилия'), 'Петрова')
    await user.type(screen.getByLabelText('Email'), 'anna@example.com')
    await user.type(screen.getByLabelText('Телефон'), '+7 900 123-45-67')
    await user.type(screen.getByLabelText('Номер карты'), '4242424242424242')
    await user.type(screen.getByLabelText('Срок действия'), '1230')
    await user.type(screen.getByLabelText('CVC'), '987')
    await user.type(screen.getByLabelText('Имя держателя'), 'ANNA PETROVA')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))
    expect(screen.getByRole('button', { name: 'Обрабатываем…' })).toBeTruthy()

    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1), { timeout: 3000 })
    const [booking] = bookingsStore.get()
    expect(nav.replace).toHaveBeenCalledWith(`/booking/confirmation?id=${booking.id}`)
    expect(booking).toMatchObject({
      status: 'confirmed',
      cardLast4: '4242',
      payment: 'now',
      total: 3 * nowRate.pricePerNight,
    })

    const raw = localStorage.getItem(bookingsStore.key)!
    expect(raw).not.toMatch(/4242 ?4242/)
    expect(raw).not.toContain('987')
    expect(raw).not.toContain('1230')
    expect(raw).not.toContain('12/30')
  })
})
