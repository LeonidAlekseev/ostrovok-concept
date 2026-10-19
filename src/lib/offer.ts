import type { Destination } from '../data/destinations'
import { findRate, findRoom, getDestination, getHotel, type Hotel, type Rate, type Room } from './catalog'
import { addDays, nightsBetween, type IsoDate } from './dates'
import { parseStayParams, setStayParams, validateSearch, type Stay } from './search'

/**
 * The offer contract: a chosen rate of a hotel room for a stay. The hotel page, the rate choice
 * and the checkout pass it in the URL as `hotel`, `room`, `rate` and the stay parameters of the
 * search (`checkin`, `checkout`, `adults`, `children` unless 0, `rooms`).
 */
export interface OfferSelection extends Stay {
  hotelId: string
  roomId: string
  rateId: string
}

export interface Offer extends OfferSelection {
  hotel: Hotel
  room: Room
  rate: Rate
  destination: Destination
  nights: number
  /** For the whole stay and all rooms, ₽. */
  total: number
}

export type OfferResult = { ok: true; offer: Offer } | { ok: false; error: string }

export const OFFER_NOT_FOUND = 'Предложение не найдено'

/** Price of an offer: per night × nights × rooms. */
export const offerTotal = (pricePerNight: number, nights: number, rooms: number) => pricePerNight * nights * rooms

/** The last day free cancellation applies, or `null` for a non-refundable rate. */
export const freeCancellationUntil = (rate: Rate, checkIn: IsoDate): IsoDate | null =>
  rate.cancellation.kind === 'free' ? addDays(checkIn, -rate.cancellation.daysBefore) : null

export function toOfferParams({ hotelId, roomId, rateId, ...stay }: OfferSelection): URLSearchParams {
  return setStayParams(new URLSearchParams({ hotel: hotelId, room: roomId, rate: rateId }), stay)
}

/**
 * Reads an offer from URL parameters. An unknown hotel, room or rate, or a malformed URL, is
 * "Предложение не найдено"; dates and guests get the same checks and messages as the search.
 */
export function parseOffer(params: Pick<URLSearchParams, 'get'>, today: IsoDate): OfferResult {
  const hotel = getHotel(params.get('hotel') ?? '')
  const room = hotel && findRoom(hotel, params.get('room') ?? '')
  const rate = room && findRate(room, params.get('rate') ?? '')
  const stay = parseStayParams(params)
  if (!hotel || !room || !rate || !stay) return { ok: false, error: OFFER_NOT_FOUND }

  const destination = getDestination(hotel.destinationId)!
  const errors = validateSearch({ destination: destination.name, ...stay }, today)
  const error = errors.dates ?? errors.guests
  if (error) return { ok: false, error }

  const nights = nightsBetween(stay.checkIn, stay.checkOut)
  return {
    ok: true,
    offer: {
      ...stay,
      hotelId: hotel.id,
      roomId: room.id,
      rateId: rate.id,
      hotel,
      room,
      rate,
      destination,
      nights,
      total: offerTotal(rate.pricePerNight, nights, stay.guests.rooms),
    },
  }
}
