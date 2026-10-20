import type { Destination } from '../data/destinations'
import {
  cheapestRate,
  findRate,
  findRoom,
  getDestination,
  getHotel,
  roundUp100,
  type Hotel,
  type Rate,
  type Room,
} from './catalog'
import { addDays, nightsBetween, weekday, type IsoDate } from './dates'
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

/** Friday and Saturday nights cost this much more than the weekday price of the rate. */
const WEEKEND_MARKUP = 0.15

/** Price of one room for the night starting on `date`: Friday and Saturday nights cost more, rounded up to 100 ₽. */
export const nightPrice = (pricePerNight: number, date: IsoDate) =>
  weekday(date) === 5 || weekday(date) === 6 ? roundUp100(pricePerNight * (1 + WEEKEND_MARKUP)) : pricePerNight

/** Price of an offer: the nights from check-in to the night before check-out, × rooms. */
export function stayTotal(pricePerNight: number, checkIn: IsoDate, checkOut: IsoDate, rooms: number): number {
  let total = 0
  for (let date = checkIn; date < checkOut; date = addDays(date, 1)) total += nightPrice(pricePerNight, date)
  return total * rooms
}

/** The average price of a night of one room over the stay, to the rouble. */
export const averageNight = (total: number, nights: number, rooms: number) => Math.round(total / rooms / nights)

/** Days of check-in the price without dates looks through, starting today. */
const PRICE_WINDOW_DAYS = 7

/**
 * The hotel's lowest price: its cheapest rate for the whole stay and all rooms, or, without dates,
 * for one night of the stay's rooms, the cheapest of the check-ins today and the next six days.
 */
export function lowestPrice(hotel: Hotel, stay: Stay | null, rooms: number, today: IsoDate): number {
  const { pricePerNight } = cheapestRate(hotel).rate
  if (stay) return stayTotal(pricePerNight, stay.checkIn, stay.checkOut, stay.guests.rooms)
  const nights = Array.from({ length: PRICE_WINDOW_DAYS }, (_, i) => nightPrice(pricePerNight, addDays(today, i)))
  return Math.min(...nights) * rooms
}

/** The demo discount of the GURU price. */
const GURU_DISCOUNT = 0.1

/** The GURU price: the regular price less the demo discount, to the rouble. */
export const guruPrice = (price: number) => Math.round(price * (1 - GURU_DISCOUNT))

/** The last day free cancellation applies, or `null` for a non-refundable rate. */
export const freeCancellationUntil = (rate: Pick<Rate, 'cancellation'>, checkIn: IsoDate): IsoDate | null =>
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
      total: stayTotal(rate.pricePerNight, stay.checkIn, stay.checkOut, stay.guests.rooms),
    },
  }
}
