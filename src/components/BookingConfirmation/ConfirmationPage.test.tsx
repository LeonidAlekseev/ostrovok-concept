import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBooking, EMPTY_CARD } from '@/lib/booking'
import { getHotel } from '@/lib/catalog'
import { addDays, todayIso } from '@/lib/dates'
import { parseOffer, toOfferParams } from '@/lib/offer'
import { saveBooking } from '@/lib/storage'
import { ConfirmationPage } from './ConfirmationPage'

const nav = vi.hoisted(() => ({ query: '' }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.query) }))

const hotel = getHotel('prague-old-town-lantern')!
const room = hotel.rooms[0]
const checkIn = addDays(todayIso(), 20)

function save(payment: 'now' | 'at-hotel', id: string) {
  const rate = room.rates.find((r) => r.payment === payment)!
  const result = parseOffer(
    toOfferParams({
      hotelId: hotel.id,
      roomId: room.id,
      rateId: rate.id,
      checkIn,
      checkOut: addDays(checkIn, 2),
      guests: { adults: 2, children: 0, rooms: 1 },
    }),
    todayIso(),
  )
  if (!result.ok) throw new Error(result.error)
  const card = { ...EMPTY_CARD, number: '4242 4242 4242 4242' }
  saveBooking(
    createBooking(
      result.offer,
      {
        roomGuests: [{ firstName: 'Анна', lastName: 'Петрова' }],
        email: 'anna@example.com',
        phone: '+7 900 123-45-67',
        requests: '',
        card,
        agreed: true,
      },
      id,
      new Date(),
      todayIso(),
    ),
  )
}

afterEach(() => localStorage.clear())

// booking-confirmation
describe('ConfirmationPage', () => {
  it('shows the status, number and the card of the booking', () => {
    save('now', 'OS-ABC123')
    nav.query = 'id=OS-ABC123'
    render(<ConfirmationPage />)
    expect(screen.getByText('Бронирование подтверждено')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /OS-ABC123/ })).toBeTruthy()
    expect(screen.getByText(hotel.name)).toBeTruthy()
    expect(screen.getByText('Карта •••• 4242')).toBeTruthy()
    expect(screen.getByText('anna@example.com, +7 900 123-45-67')).toBeTruthy()
    expect(screen.getByText(/хранится только в этом браузере/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Мои поездки' }).getAttribute('href')).toBe('/trips')
    expect(screen.getByRole('link', { name: 'На главную' }).getAttribute('href')).toBe('/')
  })

  it('shows payment at the hotel without a card', () => {
    save('at-hotel', 'OS-HOTEL1')
    nav.query = 'id=OS-HOTEL1'
    render(<ConfirmationPage />)
    expect(screen.getByText('Оплата в отеле при заселении')).toBeTruthy()
    expect(screen.queryByText(/Карта ••••/)).toBeNull()
  })

  it('says "Бронирование не найдено" for an unknown number', () => {
    nav.query = 'id=OS-NOPE00'
    render(<ConfirmationPage />)
    expect(screen.getByRole('heading', { name: 'Бронирование не найдено' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Мои поездки' }).getAttribute('href')).toBe('/trips')
  })
})
