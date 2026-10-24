import { describe, expect, it } from 'vitest'
import { destinations } from '../data/destinations'
import { newHotelSeeds } from '../data/hotels'
import {
  AMENITIES,
  AMENITY_SECTIONS,
  cheapestRate,
  hasFreeCancellation,
  POPULAR_AMENITIES,
  SCORE_SECTIONS,
  travelDistances,
} from './catalog'
import {
  buildCatalog,
  fullHotelsIn,
  getHotel,
  hotels,
  hotelsIn,
  MIN_HOTELS_PER_DESTINATION,
  newHotels,
  slugify,
} from './catalogGenerator'

const catalog = buildCatalog()

// hotel-catalog, Requirement: Типы жилья

/** The cities the generator fills: a city of real hotels gets none from it. */
const generatedCities = destinations.filter((d) => !d.real)
describe('stay types', () => {
  const ofType = (destinationId: string, type: string) =>
    catalog.filter((h) => h.destinationId === destinationId && h.stayType === type)

  it('gives every city 2 hostels, 2 apartments and 1 villa', () => {
    for (const d of generatedCities) {
      expect(ofType(d.id, 'hostel').length, d.id).toBeGreaterThanOrEqual(2)
      expect(ofType(d.id, 'apartments').length, d.id).toBeGreaterThanOrEqual(2)
      expect(ofType(d.id, 'villa').length, d.id).toBeGreaterThanOrEqual(1)
    }
  })

  it('keeps the old hotels as hotels with their prices', () => {
    const lantern = getHotel('prague-old-town-lantern')!
    expect(lantern.stayType).toBe('hotel')
    expect(lantern.priceFrom).toBe(7400)
    expect(cheapestRate(lantern).rate.pricePerNight).toBe(7400)
    for (const seed of newHotelSeeds)
      expect(getHotel(`${seed.destinationId}-${slugify(seed.name)}`)?.stayType).toBe('hotel')
  })

  it('sets Wi‑Fi by the kind of stay, to 10 Мбит/с, and a workspace only in some hotels and apartments', () => {
    const range = { hostel: [30, 100], hotel: [50, 300], apartments: [100, 500], villa: [50, 200] } as const
    for (const h of catalog) {
      const [min, max] = range[h.stayType]
      expect(h.wifiMbps, h.id).toBeGreaterThanOrEqual(min)
      expect(h.wifiMbps, h.id).toBeLessThanOrEqual(max)
      expect(h.wifiMbps % 10, h.id).toBe(0)
      if (h.stayType === 'hostel' || h.stayType === 'villa') expect(h.workspace, h.id).toBe(false)
    }
    for (const type of ['hotel', 'apartments']) {
      expect(
        catalog.some((h) => h.stayType === type && h.workspace),
        type,
      ).toBe(true)
      expect(
        catalog.some((h) => h.stayType === type && !h.workspace),
        type,
      ).toBe(true)
    }
  })

  it('sleeps 6–10 in a villa room and prices every stay from its cheapest rate', () => {
    for (const h of catalog.filter((x) => x.stayType === 'villa'))
      for (const room of h.rooms) expect(room.capacity, h.id).toBeGreaterThanOrEqual(6)
    const city = (type: string) => ofType('prague', type).map((h) => h.priceFrom)
    expect(Math.min(...city('villa'))).toBeGreaterThan(Math.max(...city('hostel')))
  })
})

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

  it(`gives every destination at least ${MIN_HOTELS_PER_DESTINATION} hotels, and none to a city of real hotels`, () => {
    for (const d of destinations)
      if (d.real) expect(hotelsIn(d.id), d.id).toEqual([])
      else expect(hotelsIn(d.id).length, d.id).toBeGreaterThanOrEqual(6)
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
      expect(hotel.photos.length).toBeGreaterThanOrEqual(12)
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
    for (const d of generatedCities) {
      expect(Math.min(...hotelsIn(d.id).map((h) => h.priceFrom)), d.id).toBe(d.priceFrom)
    }
  })
})

// hotel-catalog, Requirement: Фото отеля и гостей
describe('hotel and guest photos', () => {
  it('gives every hotel 12–30 photos, the five first as before, and 0–40 guest photos', () => {
    for (const hotel of catalog) {
      expect(hotel.photos.length).toBeGreaterThanOrEqual(12)
      expect(hotel.photos.length).toBeLessThanOrEqual(30)
      const first = hotel.photos.slice(0, 5).map((p) => p.caption)
      if (hotel.stayType === 'hotel') expect(first).toEqual(['Фасад', 'Лобби', 'Ресторан', 'Терраса', 'Вид из окна'])
      else expect([first[0], first[4]]).toEqual(['Фасад', 'Вид из окна'])
      expect(new Set(hotel.photos.map((p) => p.id)).size).toBe(hotel.photos.length)
      expect(hotel.guestPhotos.length).toBeLessThanOrEqual(40)
      expect(new Set(hotel.guestPhotos.map((p) => p.id)).size).toBe(hotel.guestPhotos.length)
      for (const photo of [...hotel.photos, ...hotel.guestPhotos]) expect(photo.caption).not.toBe('')
    }
    expect(catalog.some((h) => h.guestPhotos.length === 0)).toBe(true)
    expect(catalog.some((h) => h.guestPhotos.length > 20)).toBe(true)
  })
})

// hotel-catalog, Requirement: Плюсы и минусы отзывов
describe('review details', () => {
  const reviews = catalog.flatMap((h) => h.reviews)

  it('gives every review its good and a usefulness of 0–60, about half of them the bad', () => {
    for (const review of reviews) {
      expect(review.pros).not.toBe('')
      expect(review.helpful).toBeGreaterThanOrEqual(0)
      expect(review.helpful).toBeLessThanOrEqual(60)
      if ('cons' in review) expect(review.cons).not.toBe('')
    }
    const withCons = reviews.filter((r) => r.cons).length / reviews.length
    expect(withCons).toBeGreaterThan(0.4)
    expect(withCons).toBeLessThan(0.6)
    // Some run long enough to fold.
    expect(reviews.some((r) => r.pros.length > 300)).toBe(true)
  })

  it('keeps the scores, dates and authors of the reviews', () => {
    const lantern = getHotel('prague-old-town-lantern')!
    expect(lantern.reviews.slice(0, 3).map(({ id, author, date, score }) => ({ id, author, date, score }))).toEqual([
      { id: 'prague-old-town-lantern-review-2', author: 'Алексей Н.', date: '2026-09-20', score: 9.3 },
      { id: 'prague-old-town-lantern-review-3', author: 'Павел Б.', date: '2026-06-23', score: 8.6 },
      { id: 'prague-old-town-lantern-review-1', author: 'Сергей Т.', date: '2026-01-15', score: 9.6 },
    ])
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
    const onlyHotels = catalog.filter((h) => h.stayType === 'hotel')
    const perCity = destinations.map((d) => onlyHotels.filter((h) => h.destinationId === d.id).length)
    expect(onlyHotels.filter((h) => !hasFreeCancellation(h))).toHaveLength(
      perCity.reduce((sum, count) => sum + Math.floor(count / 2), 0),
    )
    for (const d of destinations) {
      const own = onlyHotels.filter((h) => h.destinationId === d.id).sort((a, b) => a.id.localeCompare(b.id))
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

// hotel-catalog, Requirement: Транспорт рядом с отелем
describe('nearest metro station', () => {
  it('is one of the city stations 150–1 200 m away, to 10 m, in a city with a metro', () => {
    const prague = destinations.find((d) => d.id === 'prague')!
    for (const h of catalog.filter((h) => h.destinationId === 'prague')) {
      expect(prague.metro, h.id).toContain(h.metro?.station)
      expect(h.metro!.meters).toBeGreaterThanOrEqual(150)
      expect(h.metro!.meters).toBeLessThanOrEqual(1200)
      expect(h.metro!.meters % 10).toBe(0)
    }
  })

  it('is missing in a city without one', () => {
    for (const h of catalog.filter((h) => h.destinationId === 'zakynthos')) expect(h.metro, h.id).toBeNull()
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

// hotel-catalog, Requirement: Удобства по разделам
describe('amenities', () => {
  it('belong each to a known section, and every section has some', () => {
    const sections = new Set(Object.values(AMENITIES).map((a) => a.section))
    expect([...sections]).toEqual(Object.keys(AMENITY_SECTIONS))
    expect(POPULAR_AMENITIES.every((key) => key in AMENITIES)).toBe(true)
  })

  it('mark the paid ones', () => {
    const paid = Object.values(AMENITIES).filter((a) => 'paid' in a)
    expect(paid.map((a) => a.label)).toContain('Трансфер из аэропорта')
    expect(paid.map((a) => a.label)).toContain('Спа-центр')
    expect(AMENITIES.wifi).not.toHaveProperty('paid')
  })

  it('give every hotel Wi‑Fi and the front desk, without repeats, in the order of the catalogue', () => {
    const order = Object.keys(AMENITIES)
    for (const hotel of catalog) {
      expect(hotel.amenities, hotel.id).toEqual(expect.arrayContaining(['wifi', 'front-desk']))
      expect(new Set(hotel.amenities).size, hotel.id).toBe(hotel.amenities.length)
      const indexes = hotel.amenities.map((key) => order.indexOf(key))
      expect(indexes, hotel.id).toEqual([...indexes].sort((a, b) => a - b))
    }
  })

  it('are the same every time the catalogue is built', () => {
    expect(buildCatalog().map((h) => h.amenities)).toEqual(catalog.map((h) => h.amenities))
  })

  it('grow with the stars', () => {
    const average = (stars: number) => {
      const some = catalog.filter((h) => h.stars === stars)
      return some.reduce((sum, h) => sum + h.amenities.length, 0) / some.length
    }
    expect(average(5)).toBeGreaterThan(average(3))
  })
})

// hotel-catalog, Requirement: Оценки по разделам
describe('section scores', () => {
  it('rate each of the 8 sections 1–10 to a tenth, around the rating', () => {
    for (const hotel of catalog) {
      expect(
        hotel.sectionScores.map((s) => s.label),
        hotel.id,
      ).toEqual([...SCORE_SECTIONS])
      for (const { score } of hotel.sectionScores) {
        expect(score).toBeGreaterThanOrEqual(1)
        expect(score).toBeLessThanOrEqual(10)
        expect(Math.round(score * 10) / 10).toBe(score)
        expect(Math.abs(score - hotel.rating)).toBeLessThanOrEqual(1.5 + 1e-9)
      }
    }
  })

  it('put some sections of some hotels below 7, so the colour scale shows', () => {
    expect(catalog.some((h) => h.sectionScores.some((s) => s.score < 7))).toBe(true)
  })

  it('are the same every time the catalogue is built', () => {
    expect(buildCatalog().map((h) => h.sectionScores)).toEqual(catalog.map((h) => h.sectionScores))
  })
})

// hotel-page, Requirement: Расположение отеля
describe('travelDistances', () => {
  it('gives kilometres to the centre and the metro metres in kilometres', () => {
    expect(travelDistances({ distanceKm: 1.7, metro: { station: 'Můstek', meters: 1200 } })).toEqual({
      centre: 1.7,
      metro: 1.2,
    })
  })

  it('keeps a hotel next door at its distance', () => {
    expect(travelDistances({ distanceKm: 0.1, metro: null }).centre).toBe(0.1)
  })

  it('has no metro distance in a city without a metro', () => {
    expect(travelDistances({ distanceKm: 3, metro: null })).toEqual({ centre: 3, metro: null })
  })
})

// hotel-catalog, Requirement: Тексты по типу жилья
describe('texts by kind of stay', () => {
  it('call only a hotel «отель»', () => {
    for (const hotel of buildCatalog()) {
      if (hotel.stayType === 'hotel') continue
      const texts = [hotel.description, ...hotel.reviews.flatMap((r) => [r.pros, r.cons ?? ''])]
      expect(
        texts.filter((t) => /отел/i.test(t)),
        hotel.id,
      ).toEqual([])
    }
  })
})
