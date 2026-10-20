import { describe, expect, it } from 'vitest'
import { destinations } from '../data/destinations'
import { newHotelSeeds } from '../data/hotels'
import {
  buildCatalog,
  cheapestRate,
  fullHotelsIn,
  getHotel,
  hasFreeCancellation,
  hotels,
  hotelsIn,
  MIN_HOTELS_PER_DESTINATION,
  newHotels,
  slugify,
} from './catalog'

const catalog = buildCatalog()

describe('catalogue', () => {
  it('is the same every time it is built', () => {
    expect(buildCatalog()).toEqual(catalog)
    expect(JSON.stringify(buildCatalog())).toBe(JSON.stringify(catalog))
  })

  it('matches the cached hotels', () => {
    expect(catalog.map((h) => h.id)).toEqual(hotels.map((h) => h.id))
    expect(getHotel('prague-old-town-lantern')).toEqual(catalog.find((h) => h.id === 'prague-old-town-lantern'))
    expect(getHotel('prague-old-town-lantern')).toBe(getHotel('prague-old-town-lantern'))
    expect(getHotel('nowhere')).toBeUndefined()
  })

  it('has unique slug ids', () => {
    expect(new Set(hotels.map((h) => h.id)).size).toBe(hotels.length)
    for (const h of hotels) expect(h.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it(`gives every destination at least ${MIN_HOTELS_PER_DESTINATION} hotels`, () => {
    for (const d of destinations) expect(hotelsIn(d.id).length, d.id).toBeGreaterThanOrEqual(6)
  })

  it('finds the Prague hotels, the seeds among them', () => {
    const prague = hotelsIn('prague')
    expect(prague.length).toBeGreaterThanOrEqual(6)
    expect(prague.map((h) => h.name)).toContain('Old Town Lantern')
    expect(fullHotelsIn('prague').map((h) => h.id)).toEqual(prague.map((h) => h.id))
  })

  it('keeps the hand-picked hotels as the "new" feed, in their order', () => {
    expect(
      newHotels.map(({ destinationId, name, stars, rating, priceFrom }) => ({
        destinationId,
        name,
        stars,
        rating,
        priceFrom,
      })),
    ).toEqual(newHotelSeeds)
    expect(newHotels.every((h) => h.isNew)).toBe(true)
    expect(hotels.filter((h) => h.isNew)).toHaveLength(newHotels.length)
  })

  it('fills every hotel, room and rate', () => {
    for (const hotel of catalog) {
      expect(hotel.stars).toBeGreaterThanOrEqual(1)
      expect(hotel.stars).toBeLessThanOrEqual(5)
      expect(hotel.rating).toBeGreaterThanOrEqual(0)
      expect(hotel.rating).toBeLessThanOrEqual(10)
      expect(hotel.reviewCount).toBeGreaterThanOrEqual(hotel.reviews.length)
      expect(hotel.reviews.length).toBeGreaterThanOrEqual(5)
      expect(hotel.reviews.length).toBeLessThanOrEqual(20)
      expect(hotel.address).not.toBe('')
      expect(hotel.description).not.toBe('')
      expect(hotel.amenities).toContain('wifi')
      expect(hotel.photos.length).toBeGreaterThan(0)
      expect(hotel.distanceKm).toBeLessThanOrEqual(5)
      expect(hotel.rooms.length).toBeGreaterThanOrEqual(3)
      expect(hotel.rooms.length).toBeLessThanOrEqual(6)
      for (const room of hotel.rooms) {
        expect(room.name).not.toBe('')
        expect(room.area).toBeGreaterThan(0)
        expect(room.capacity).toBeGreaterThan(0)
        expect(room.rates.length).toBeGreaterThanOrEqual(1)
        expect(room.rates.length).toBeLessThanOrEqual(4)
        for (const rate of room.rates) expect(rate.pricePerNight).toBeGreaterThan(0)
      }
    }
  })

  it('places hotels within about 5 km of the city centre', () => {
    for (const hotel of catalog) {
      const d = destinations.find((x) => x.id === hotel.destinationId)!
      expect(Math.abs(hotel.lat - d.lat), hotel.id).toBeLessThan(0.05)
    }
  })

  it('prices a hotel from its cheapest rate and a city from its cheapest hotel', () => {
    for (const hotel of catalog) expect(cheapestRate(hotel).rate.pricePerNight, hotel.id).toBe(hotel.priceFrom)
    for (const d of destinations) {
      expect(Math.min(...hotelsIn(d.id).map((h) => h.priceFrom)), d.id).toBe(d.priceFrom)
    }
  })
})

// hotel-catalog, Requirement: Город в родительном падеже
describe('destinations', () => {
  it('have a name in the genitive', () => {
    for (const d of destinations) expect(d.genitive.trim(), d.id).not.toBe('')
    expect(destinations.find((d) => d.id === 'prague')!.genitive).toBe('Праги')
  })
})

// hotel-catalog, Requirement: Бесплатная отмена отеля
describe('hasFreeCancellation', () => {
  const hotel = getHotel('prague-old-town-lantern')!
  const withRates = (...kinds: ('free' | 'non-refundable')[]) => ({
    ...hotel,
    rooms: [
      {
        ...hotel.rooms[0],
        rates: kinds.map((kind, i) => ({
          ...hotel.rooms[0].rates[0],
          id: `rate-${i}`,
          cancellation: kind === 'free' ? { kind, daysBefore: 1 } : { kind },
        })),
      },
    ],
  })

  it('is true when one rate is refundable', () => {
    expect(hasFreeCancellation(withRates('non-refundable', 'free', 'non-refundable'))).toBe(true)
  })

  it('is false when no rate is', () => {
    expect(hasFreeCancellation(withRates('non-refundable', 'non-refundable'))).toBe(false)
  })

  it('is false for exactly every second hotel of a city, by id', () => {
    expect(catalog.filter((h) => !hasFreeCancellation(h))).toHaveLength(Math.floor(catalog.length / 2))
    for (const d of destinations) {
      const own = catalog.filter((h) => h.destinationId === d.id).sort((a, b) => a.id.localeCompare(b.id))
      own.forEach((h, i) => expect(hasFreeCancellation(h), h.id).toBe(i % 2 === 0))
      if (own.length > 1) expect(own.some(hasFreeCancellation), d.id).toBe(true)
    }
  })

  it('keeps every rate of a non-refundable hotel non-refundable', () => {
    const none = catalog.filter((h) => !hasFreeCancellation(h))
    for (const h of none)
      for (const room of h.rooms)
        for (const rate of room.rates) expect(rate.cancellation.kind, h.id).toBe('non-refundable')
  })
})

describe('slugify', () => {
  it('turns Latin, accented and Cyrillic names into slugs', () => {
    expect(slugify('Old Town Lantern')).toBe('old-town-lantern')
    expect(slugify('Grünerløkka Studios')).toBe('grunerlokka-studios')
    expect(slugify('Malasaña Patio')).toBe('malasana-patio')
    expect(slugify('Золотой Рог')).toBe('zolotoy-rog')
    expect(slugify('Kok-Tobe View')).toBe('kok-tobe-view')
  })
})
