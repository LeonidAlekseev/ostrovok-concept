import type { Cancellation } from './catalog'
import { formatLongDate, fromIso, type IsoDate } from './dates'
import { freeCancellationUntil, type Offer } from './offer'
import { cancellationDeadline } from './rates'
import type { Booking } from './storage'

/** Checks of the booking form: each returns an error message, or `undefined` when the value is fine. */

export const MAX_REQUESTS_LENGTH = 500

export const validateName = (value: string, message: string) => (value.trim() ? undefined : message)

export function validateEmail(value: string): string | undefined {
  const email = value.trim()
  if (!email) return 'Введите email'
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? undefined : 'Проверьте email'
}

export function validatePhone(value: string): string | undefined {
  const phone = value.trim()
  if (!phone) return 'Введите телефон'
  const digits = phone.replace(/\D/g, '')
  return /^\+?[\d\s()-]+$/.test(phone) && digits.length >= 10 && digits.length <= 15 ? undefined : 'Проверьте телефон'
}

export const validateRequests = (value: string) =>
  value.length > MAX_REQUESTS_LENGTH ? `Не больше ${MAX_REQUESTS_LENGTH} символов` : undefined

// ---------------------------------------------------------------------------------------------
// Card: demo only, the values live in the form state and never leave it.

export interface CardValues {
  number: string
  expiry: string
  cvc: string
  holder: string
}

export const EMPTY_CARD: CardValues = { number: '', expiry: '', cvc: '', holder: '' }

export const cardDigits = (value: string) => value.replace(/\D/g, '')

/** The Luhn checksum of a string of digits. */
export function luhn(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

/** "4242424242424242" → "4242 4242 4242 4242"; at most 19 digits. */
export const formatCardNumber = (value: string) =>
  (
    cardDigits(value)
      .slice(0, 19)
      .match(/.{1,4}/g) ?? []
  ).join(' ')

/** "1228" → "12/28", "1" stays "1"; at most 4 digits. */
export function formatExpiry(value: string): string {
  const digits = cardDigits(value).slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}

export function validateCardNumber(value: string): string | undefined {
  const digits = cardDigits(value)
  return digits.length >= 16 && digits.length <= 19 && luhn(digits) ? undefined : 'Проверьте номер карты'
}

/** `MM/YY`, valid through the end of that month. */
export function validateExpiry(value: string, today: IsoDate): string | undefined {
  const match = /^(\d{2})\/(\d{2})$/.exec(value)
  const month = match ? Number(match[1]) : 0
  if (month < 1 || month > 12) return 'Проверьте срок действия'
  const now = fromIso(today)
  const expires = (2000 + Number(match![2])) * 12 + month
  return expires >= now.getFullYear() * 12 + now.getMonth() + 1 ? undefined : 'Срок действия карты истёк'
}

export const validateCvc = (value: string) => (/^\d{3,4}$/.test(value) ? undefined : 'Проверьте CVC')

// ---------------------------------------------------------------------------------------------
// Whole form

export interface RoomGuest {
  firstName: string
  lastName: string
}

export interface BookingFormValues {
  roomGuests: RoomGuest[]
  email: string
  phone: string
  requests: string
  card: CardValues
  agreed: boolean
}

/** Errors by the id of the field, in the order of the fields on the page. */
export type FormErrors = Record<string, string>

export const guestFieldId = (room: number, field: keyof RoomGuest) => `guest-${room}-${field}`

/** Checks guests, contacts and requests: what an account can edit later, too. */
export function validateTravelerDetails({
  roomGuests,
  email,
  phone,
  requests,
}: Pick<BookingFormValues, 'roomGuests' | 'email' | 'phone' | 'requests'>): FormErrors {
  const errors: FormErrors = {}
  const add = (id: string, message: string | undefined) => {
    if (message) errors[id] = message
  }
  roomGuests.forEach((guest, i) => {
    add(guestFieldId(i, 'firstName'), validateName(guest.firstName, 'Введите имя'))
    add(guestFieldId(i, 'lastName'), validateName(guest.lastName, 'Введите фамилию'))
  })
  add('email', validateEmail(email))
  add('phone', validatePhone(phone))
  add('requests', validateRequests(requests))
  return errors
}

export function validateCard(card: CardValues, today: IsoDate): FormErrors {
  const errors: FormErrors = {}
  const add = (id: string, message: string | undefined) => {
    if (message) errors[id] = message
  }
  add('card-number', validateCardNumber(card.number))
  add('card-expiry', validateExpiry(card.expiry, today))
  add('card-cvc', validateCvc(card.cvc))
  add('card-holder', validateName(card.holder, 'Введите имя держателя'))
  return errors
}

export function validateBookingForm(values: BookingFormValues, payment: Offer['rate']['payment'], today: IsoDate) {
  const errors: FormErrors = {
    ...validateTravelerDetails(values),
    ...(payment === 'now' ? validateCard(values.card, today) : {}),
  }
  if (!values.agreed) errors.agreed = 'Подтвердите согласие с условиями'
  return errors
}

// ---------------------------------------------------------------------------------------------
// Booking

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** `OS-` and 6 random characters `[A-Z0-9]`. */
export function newBookingId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return `OS-${Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('')}`
}

/** The cancellation terms as they are at `today`: a free period that is already over is non-refundable. */
export const effectiveCancellation = (offer: Offer, today: IsoDate): Cancellation =>
  cancellationDeadline(offer.rate, offer.checkIn, today) ? offer.rate.cancellation : { kind: 'non-refundable' }

/** The booking to store: only the last 4 digits of the card are kept. */
export function createBooking(offer: Offer, values: BookingFormValues, id: string, now: Date, today: IsoDate): Booking {
  const payment = offer.rate.payment
  return {
    id,
    createdAt: now.toISOString(),
    status: 'confirmed',
    hotelId: offer.hotelId,
    roomId: offer.roomId,
    rateId: offer.rateId,
    checkIn: offer.checkIn,
    checkOut: offer.checkOut,
    guests: offer.guests,
    roomGuests: values.roomGuests.map(({ firstName, lastName }) => ({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    })),
    contact: { email: values.email.trim(), phone: values.phone.trim() },
    requests: values.requests.trim(),
    payment,
    cardLast4: payment === 'now' ? cardDigits(values.card.number).slice(-4) : null,
    total: offer.total,
    cancellation: effectiveCancellation(offer, today),
  }
}

/** "Бесплатная отмена до 12 ноября 2026 г." or "Невозвратный тариф". */
export function cancellationLabel(cancellation: Cancellation, checkIn: IsoDate): string {
  const until = freeCancellationUntil({ cancellation }, checkIn)
  return until ? `Бесплатная отмена до ${formatLongDate(until)}` : 'Невозвратный тариф'
}
