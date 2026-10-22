import { destinations, type Destination } from '../data/destinations'
import { fullHotelsIn, getDestination, getHotel, hotels, newHotels, type Hotel, type HotelSummary } from './catalog'

/**
 * The one way into the catalogue: pages, components and hooks read destinations and hotels here and
 * hand them to the calculations (search results, vibe, horoscope, assistant, offer, collections, trips)
 * as arguments. For now the catalogue is the local generator of src/lib/catalog.ts, read synchronously
 * on the server and in the browser alike; only this module changes when it moves to the database.
 */

export const loadDestinations = (): readonly Destination[] => destinations

export const loadDestination = (id: string): Destination | undefined => getDestination(id)

/** Summaries of all hotels, grouped by city in the order of the destinations. */
export const loadHotelSummaries = (): readonly HotelSummary[] => hotels

/** The hand-picked "recently added" hotels, in their original order. */
export const loadNewHotels = (): readonly HotelSummary[] => newHotels

/** The full hotel, or `undefined` for an unknown id. */
export const loadHotel = (id: string): Hotel | undefined => getHotel(id)

/** Full hotels by id, in the order of the ids; unknown ids are skipped. */
export const loadHotels = (ids: readonly string[]): Hotel[] => ids.flatMap((id) => getHotel(id) ?? [])

/** Every full hotel of the catalogue, in the order of `loadHotelSummaries`. */
export const loadAllHotels = (): Hotel[] => hotels.map((h) => getHotel(h.id)!)

/** Full hotels of the cities, city by city in the given order. */
export const loadCityHotels = (destinationIds: readonly string[]): Hotel[] =>
  destinationIds.flatMap((id) => fullHotelsIn(id))
