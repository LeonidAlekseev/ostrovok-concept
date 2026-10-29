import { effectiveCancellation } from './booking'
import { findRate, findRoom, type Cancellation, type Hotel } from './catalog'
import { nightsBetween, type IsoDate } from './dates'
import { formatPrice } from './format'
import { freeCancellationUntil, guruPrice, nightPrice, stayTotal } from './offer'
import { MAX_NIGHTS } from './search'
import type { Booking } from './storage'

export type TripTab = 'upcoming' | 'past' | 'cancelled'

/** Upcoming: confirmed and the check-out is today or later; past: confirmed and over; the rest are cancelled. */
export function tripTab(booking: Pick<Booking, 'status' | 'checkOut'>, today: IsoDate): TripTab {
  if (booking.status === 'cancelled') return 'cancelled'
  return booking.checkOut >= today ? 'upcoming' : 'past'
}

/** Upcoming trips by check-in ascending, the others descending. */
export function tripsIn(bookings: Booking[], tab: TripTab, today: IsoDate): Booking[] {
  const list = bookings.filter((b) => tripTab(b, today) === tab)
  return list.sort((a, b) => (tab === 'upcoming' ? 1 : -1) * a.checkIn.localeCompare(b.checkIn))
}

type FeeBooking = Pick<
  Booking,
  'hotelId' | 'roomId' | 'rateId' | 'cancellation' | 'checkIn' | 'checkOut' | 'guests' | 'total'
>

/** The first night of the stay for all rooms, ₽, at the price of the booked rate of the booked `hotel`. */
function firstNight(booking: FeeBooking, hotel: Hotel | undefined): number {
  const room = hotel && findRoom(hotel, booking.roomId)
  const rate = room && findRate(room, booking.rateId)
  // A rate no longer in the catalogue: an average night of the paid total.
  if (!rate) return Math.round(booking.total / nightsBetween(booking.checkIn, booking.checkOut))
  return nightPrice(rate.pricePerNight, booking.checkIn) * booking.guests.rooms
}

/**
 * What cancelling at `today` withholds, ₽: nothing up to the last free day, the first night after it,
 * everything for a non-refundable rate. `hotel` is the booked one, `undefined` once it left the catalogue.
 */
export function cancellationFee(booking: FeeBooking, today: IsoDate, hotel: Hotel | undefined) {
  const until = freeCancellationUntil(booking, booking.checkIn)
  if (until === null) return booking.total
  if (until >= today) return 0
  return firstNight(booking, hotel)
}

export function cancelBooking(booking: Booking, now: Date, today: IsoDate, hotel: Hotel | undefined): Booking {
  return {
    ...booking,
    status: 'cancelled',
    cancelledAt: now.toISOString(),
    cancellationFee: cancellationFee(booking, today, hotel),
  }
}

export const STATUS_LABEL: Record<TripTab, string> = {
  upcoming: 'Подтверждено',
  past: 'Завершено',
  cancelled: 'Отменено',
}

/** The withheld amount as text: "Бесплатно" or "Удержание: 20 000 ₽". */
export const feeLabel = (fee: number) => (fee === 0 ? 'Бесплатно' : `Удержание: ${formatPrice(fee)}`)

// ---------------------------------------------------------------------------------------------
// Эвал and the bookings: the bookings stay in this browser, the assistant gets them with the request and proposes a
// change of the dates the traveller applies here with «Подтвердить».

/** The bookings a request brings at most: the newest first. */
export const MAX_BOOKINGS = 50

/** What of a booking Эвал is sent: no names, contacts, requests or card digits. */
export type TripBooking = Omit<Booking, 'roomGuests' | 'contact' | 'requests' | 'cardLast4'>

// oxlint-disable-next-line no-unused-vars -- the personal fields are left out
export const tripBooking = ({ roomGuests, contact, requests, cardLast4, ...booking }: Booking): TripBooking => booking

/**
 * New dates of a booking with the price and the cancellation terms counted as at booking. `from` is the booking as it
 * was quoted: the change applies only to a booking still so.
 */
export interface DateChange {
  bookingId: string
  from: { checkIn: IsoDate; checkOut: IsoDate; total: number }
  checkIn: IsoDate
  checkOut: IsoDate
  /** For the whole stay and all rooms, ₽. */
  total: number
  cancellation: Cancellation
}

/** The proposal in the chat: waiting for «Подтвердить», applied, or the booking changed since it was counted. */
export type DateChangeState = 'proposed' | 'applied' | 'outdated'

export type DateQuote = { ok: true; change: DateChange } | { ok: false; error: string }

/**
 * The booking on new dates at the price of its rate in the catalogue now, as the checkout counts it (`stayTotal` at the GURU price:
 * Friday and Saturday nights cost more), with the rate's cancellation terms as they are at `today`. Only an upcoming
 * stay that has not begun moves; the dates get the checks of the search.
 */
export function quoteDateChange(
  booking: TripBooking,
  hotel: Hotel | undefined,
  checkIn: IsoDate,
  checkOut: IsoDate,
  today: IsoDate,
): DateQuote {
  if (booking.status === 'cancelled') return { ok: false, error: 'Бронирование отменено: даты не изменить' }
  if (booking.checkIn < today) return { ok: false, error: 'Поездка уже началась или прошла: даты не изменить' }
  if (checkIn < today) return { ok: false, error: 'Дата заезда уже прошла' }
  const nights = nightsBetween(checkIn, checkOut)
  if (!(nights >= 1)) return { ok: false, error: 'Дата выезда должна быть позже даты заезда' }
  if (nights > MAX_NIGHTS) return { ok: false, error: `Максимальный срок проживания — ${MAX_NIGHTS} ночей` }
  if (checkIn === booking.checkIn && checkOut === booking.checkOut)
    return { ok: false, error: 'Это те же даты, что в бронировании' }
  const room = hotel && findRoom(hotel, booking.roomId)
  const rate = room && findRate(room, booking.rateId)
  if (!rate) return { ok: false, error: 'Тарифа бронирования больше нет в каталоге: цену на новые даты не посчитать' }
  return {
    ok: true,
    change: {
      bookingId: booking.id,
      from: { checkIn: booking.checkIn, checkOut: booking.checkOut, total: booking.total },
      checkIn,
      checkOut,
      total: guruPrice(stayTotal(rate.pricePerNight, checkIn, checkOut, booking.guests.rooms)),
      cancellation: effectiveCancellation(rate, checkIn, today),
    },
  }
}

/**
 * The booking with the confirmed change, or `null` when the change no longer fits: another booking, a cancelled one,
 * dates or a total changed since it was counted, or a check-in now past.
 */
export function applyDateChange(booking: Booking, change: DateChange, today: IsoDate): Booking | null {
  const { from } = change
  if (booking.id !== change.bookingId || booking.status !== 'confirmed' || change.checkIn < today) return null
  if (booking.checkIn !== from.checkIn || booking.checkOut !== from.checkOut || booking.total !== from.total)
    return null
  const { checkIn, checkOut, total, cancellation } = change
  return { ...booking, checkIn, checkOut, total, cancellation }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

function parseCancellation(value: unknown): Cancellation | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { kind, daysBefore } = value as Record<string, unknown>
  if (kind === 'non-refundable') return { kind }
  if (kind === 'free' && Number.isInteger(daysBefore) && (daysBefore as number) >= 0)
    return { kind, daysBefore: daysBefore as number }
  return undefined
}

/** A change read from an answer or a saved chat; anything off the shape reads as none. */
export function parseDateChange(value: unknown): DateChange | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { bookingId, from, checkIn, checkOut, total } = value as Record<string, unknown>
  const before = (typeof from === 'object' && from !== null ? from : {}) as Record<string, unknown>
  const cancellation = parseCancellation((value as Record<string, unknown>).cancellation)
  const dates = [checkIn, checkOut, before.checkIn, before.checkOut]
  if (typeof bookingId !== 'string' || !/^OS-[A-Z0-9]{6}$/.test(bookingId)) return undefined
  if (!dates.every((d) => typeof d === 'string' && ISO.test(d))) return undefined
  if (!isAmount(total) || !isAmount(before.total) || !cancellation) return undefined
  return {
    bookingId,
    from: { checkIn: before.checkIn as IsoDate, checkOut: before.checkOut as IsoDate, total: before.total },
    checkIn: checkIn as IsoDate,
    checkOut: checkOut as IsoDate,
    total,
    cancellation,
  }
}
