import { describe, expect, it } from 'vitest'
import { destinations } from '../data/destinations'
import { getHotel } from './catalog'
import {
  cancellationLabel,
  createBooking,
  EMPTY_CARD,
  formatCardNumber,
  formatExpiry,
  luhn,
  newBookingId,
  validateBookingForm,
  validateCard,
  validateEmail,
  validateExpiry,
  validatePhone,
  validateRequests,
  type BookingFormValues,
} from './booking'
import { parseOffer, toOfferParams } from './offer'
import { toStoredBooking } from './storage'

const TODAY = '2026-10-19'
const hotel = getHotel('prague-old-town-lantern')!
const room = hotel.rooms[0]
const stay = { checkIn: '2026-11-10', checkOut: '2026-11-13', guests: { adults: 2, children: 0, rooms: 1 } }
const offerFor = (rateId: string) => {
  const result = parseOffer(
    toOfferParams({ hotelId: hotel.id, roomId: room.id, rateId, ...stay }),
    TODAY,
    [hotel],
    destinations,
  )
  if (!result.ok) throw new Error(result.error)
  return result.offer
}
const payNow = room.rates.find((r) => r.payment === 'now')!
const atHotel = room.rates.find((r) => r.payment === 'at-hotel')!

const filled: BookingFormValues = {
  roomGuests: [{ firstName: ' Анна ', lastName: 'Петрова' }],
  email: 'anna@example.com',
  phone: '+7 900 123-45-67',
  requests: '',
  card: { number: '4242 4242 4242 4242', expiry: '12/29', cvc: '123', holder: 'ANNA PETROVA' },
  agreed: true,
}

// booking-checkout, Requirement: Демо-оплата
describe('card checks', () => {
  it('Luhn accepts the test card and rejects a changed digit', () => {
    expect(luhn('4242424242424242')).toBe(true)
    expect(luhn('4242424242424241')).toBe(false)
  })

  it('formats number and expiry while typing', () => {
    expect(formatCardNumber('42424242 4242a4242')).toBe('4242 4242 4242 4242')
    expect(formatExpiry('1229')).toBe('12/29')
    expect(formatExpiry('1')).toBe('1')
  })

  it('rejects a number that fails Luhn or is too short', () => {
    expect(validateCard({ ...filled.card, number: '4242 4242 4242 4241' }, TODAY)['card-number']).toBe(
      'Проверьте номер карты',
    )
    expect(validateCard({ ...filled.card, number: '4242' }, TODAY)['card-number']).toBe('Проверьте номер карты')
    expect(validateCard(filled.card, TODAY)).toEqual({})
  })

  it('expires at the end of the month', () => {
    expect(validateExpiry('10/26', TODAY)).toBeUndefined()
    expect(validateExpiry('09/26', TODAY)).toBe('Срок действия карты истёк')
    expect(validateExpiry('13/29', TODAY)).toBe('Проверьте срок действия')
    expect(validateExpiry('1/29', TODAY)).toBe('Проверьте срок действия')
  })

  it('wants 3–4 digits of CVC and a holder', () => {
    const errors = validateCard({ ...EMPTY_CARD, number: '4242424242424242', expiry: '12/29', cvc: '12' }, TODAY)
    expect(Object.keys(errors)).toEqual(['card-cvc', 'card-holder'])
    expect(validateCard({ ...filled.card, cvc: '1234' }, TODAY)).toEqual({})
  })
})

describe('contact checks', () => {
  it('checks email and phone', () => {
    expect(validateEmail('')).toBe('Введите email')
    expect(validateEmail('anna@')).toBe('Проверьте email')
    expect(validateEmail('anna@example.com')).toBeUndefined()
    expect(validatePhone('')).toBe('Введите телефон')
    expect(validatePhone('12345')).toBe('Проверьте телефон')
    expect(validatePhone('abc 900 123 45 67')).toBe('Проверьте телефон')
    expect(validatePhone('+7 (900) 123-45-67')).toBeUndefined()
  })

  it('limits the requests to 500 characters', () => {
    expect(validateRequests('a'.repeat(500))).toBeUndefined()
    expect(validateRequests('a'.repeat(501))).toBe('Не больше 500 символов')
  })
})

describe('validateBookingForm', () => {
  it('lists errors in the order of the fields', () => {
    const empty: BookingFormValues = {
      ...filled,
      roomGuests: [
        { firstName: '', lastName: '' },
        { firstName: 'Иван', lastName: '' },
      ],
      email: '',
      phone: '',
      card: EMPTY_CARD,
      agreed: false,
    }
    expect(Object.keys(validateBookingForm(empty, 'now', TODAY))).toEqual([
      'guest-0-firstName',
      'guest-0-lastName',
      'guest-1-lastName',
      'email',
      'phone',
      'card-number',
      'card-expiry',
      'card-cvc',
      'card-holder',
      'agreed',
    ])
  })

  it('skips the card when paying at the hotel', () => {
    expect(validateBookingForm({ ...filled, card: EMPTY_CARD }, 'at-hotel', TODAY)).toEqual({})
  })
})

// booking-checkout, Requirement: Отправка бронирования
describe('createBooking', () => {
  it('keeps only the last 4 digits of the card', () => {
    const booking = createBooking(offerFor(payNow.id), filled, 'OS-ABC123', new Date('2026-10-19T10:00:00Z'), TODAY)
    expect(booking).toMatchObject({
      id: 'OS-ABC123',
      status: 'confirmed',
      cardLast4: '4242',
      payment: 'now',
      roomGuests: [{ firstName: 'Анна', lastName: 'Петрова' }],
    })
    const json = JSON.stringify(booking)
    expect(json).not.toMatch(/4242 ?4242/)
    expect(json).not.toContain('cvc')
    expect(toStoredBooking(booking)).toEqual(booking)
  })

  it('has no card for a rate paid at the hotel', () => {
    expect(createBooking(offerFor(atHotel.id), filled, 'OS-ABC123', new Date(), TODAY).cardLast4).toBeNull()
  })

  it('makes the cancellation non-refundable when the free period is over', () => {
    const free = room.rates.find((r) => r.cancellation.kind === 'free')!
    const late = { ...offerFor(free.id), checkIn: '2026-10-19' }
    expect(createBooking(late, filled, 'OS-ABC123', new Date(), TODAY).cancellation).toEqual({ kind: 'non-refundable' })
  })

  it('generates ids like OS-XXXXXX', () => {
    expect(newBookingId()).toMatch(/^OS-[A-Z0-9]{6}$/)
  })

  it('labels cancellation', () => {
    expect(cancellationLabel({ kind: 'non-refundable' }, stay.checkIn)).toBe('Невозвратный тариф')
    expect(cancellationLabel({ kind: 'free', daysBefore: 3 }, '2026-11-10')).toContain('7 ноября')
    expect(cancellationLabel({ kind: 'free', daysBefore: 3 }, '2026-11-10')).toBe(
      'Бесплатная отмена до суббота, 7 ноября 2026 г.',
    )
    expect(cancellationLabel({ kind: 'free', daysBefore: 3 }, '2026-11-10', { short: true })).toBe(
      'Бесплатная отмена до 7 ноября',
    )
    expect(cancellationLabel({ kind: 'free', daysBefore: 3 }, null)).toBe('Бесплатная отмена за 3 дня до заезда')
  })
})
