import type { Rate, Room } from './catalog'
import { nightsBetween, type IsoDate } from './dates'
import { freeCancellationUntil, offerTotal } from './offer'
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
  return guestsPerRoom(guests) > room.capacity
    ? `Вмещает до ${room.capacity} ${room.capacity === 1 ? 'гостя' : 'гостей'}`
    : null
}

export interface RatePrice {
  perNight: number
  /** For the whole stay and all rooms; `null` until the dates are chosen. */
  total: number | null
}

export const ratePrice = (rate: Rate, stay: Stay | null): RatePrice => ({
  perNight: rate.pricePerNight,
  total: stay && offerTotal(rate.pricePerNight, nightsBetween(stay.checkIn, stay.checkOut), stay.guests.rooms),
})
