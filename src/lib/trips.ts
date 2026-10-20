import { findRate, findRoom, getHotel } from './catalog'
import { nightsBetween, type IsoDate } from './dates'
import { formatPrice } from './format'
import { freeCancellationUntil, nightPrice } from './offer'
import type { Booking } from './storage'

export type TripTab = 'upcoming' | 'past' | 'cancelled'

/** Upcoming: confirmed and the check-out is today or later; past: confirmed and over; the rest are cancelled. */
export function tripTab(booking: Booking, today: IsoDate): TripTab {
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

/** The first night of the stay for all rooms, ₽, at the price of the booked rate. */
function firstNight(booking: FeeBooking): number {
  const hotel = getHotel(booking.hotelId)
  const room = hotel && findRoom(hotel, booking.roomId)
  const rate = room && findRate(room, booking.rateId)
  // A rate no longer in the catalogue: an average night of the paid total.
  if (!rate) return Math.round(booking.total / nightsBetween(booking.checkIn, booking.checkOut))
  return nightPrice(rate.pricePerNight, booking.checkIn) * booking.guests.rooms
}

/**
 * What cancelling at `today` withholds, ₽: nothing up to the last free day, the first night after it,
 * everything for a non-refundable rate.
 */
export function cancellationFee(booking: FeeBooking, today: IsoDate) {
  const until = freeCancellationUntil(booking, booking.checkIn)
  if (until === null) return booking.total
  if (until >= today) return 0
  return firstNight(booking)
}

export function cancelBooking(booking: Booking, now: Date, today: IsoDate): Booking {
  return {
    ...booking,
    status: 'cancelled',
    cancelledAt: now.toISOString(),
    cancellationFee: cancellationFee(booking, today),
  }
}

export const STATUS_LABEL: Record<TripTab, string> = {
  upcoming: 'Подтверждено',
  past: 'Завершено',
  cancelled: 'Отменено',
}

/** The withheld amount as text: "Бесплатно" or "Удержание: 20 000 ₽". */
export const feeLabel = (fee: number) => (fee === 0 ? 'Бесплатно' : `Удержание: ${formatPrice(fee)}`)
