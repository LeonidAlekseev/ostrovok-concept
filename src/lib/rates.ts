import type { Rate, Room } from './catalog'
import { nightsBetween, type IsoDate } from './dates'
import { averageNight, freeCancellationUntil, stayTotal } from './offer'
import type { Guests, Stay } from './search'

/** Free cancellation until `until`, or `null`: non-refundable, or the free period is already over. */
export function cancellationDeadline(
  rate: Pick<Rate, 'cancellation'>,
  checkIn: IsoDate,
  today: IsoDate,
): IsoDate | null {
  const until = freeCancellationUntil(rate, checkIn)
  return until !== null && until >= today ? until : null
}

/** Guests one room has to sleep: all guests split evenly between the rooms, rounded up. */
export const guestsPerRoom = ({ adults, children, rooms }: Guests) => Math.ceil((adults + children) / rooms)

/** Why the room cannot be booked for these guests, or `null`. */
export function unavailableReason(room: Room, guests: Guests): string | null {
  // A room of unknown capacity has no rate to book anyway.
  if (room.capacity === 0) return null
  return guestsPerRoom(guests) > room.capacity
    ? `Вмещает до ${room.capacity} ${room.capacity === 1 ? 'гостя' : 'гостей'}`
    : null
}

export interface RatePrice {
  /** The average night of one room over the stay; the weekday price until the dates are chosen. */
  perNight: number
  /** For the whole stay and all rooms; `null` until the dates are chosen. */
  total: number | null
}

export function ratePrice(rate: Rate, stay: Stay | null): RatePrice {
  if (!stay) return { perNight: rate.pricePerNight, total: null }
  const { checkIn, checkOut, guests } = stay
  const total = stayTotal(rate.pricePerNight, checkIn, checkOut, guests.rooms)
  return { perNight: averageNight(total, nightsBetween(checkIn, checkOut), guests.rooms), total }
}
