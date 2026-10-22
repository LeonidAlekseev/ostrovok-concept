import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { destinations } from '../data/destinations'
import { fullHotelsIn, type Hotel } from './catalog'
import { loadCityHotels } from './catalogSource'
import {
  applyFilters,
  countFilters,
  DEMO_SEARCH_MS,
  NO_FILTERS,
  pageCount,
  pageItems,
  parseFilters,
  parsePage,
  priceBounds,
  runDemoSearch,
  setFilterParams,
  targetDestinations,
  type Filters,
} from './results'
import { nightPrice, stayTotal } from './offer'
import { resolveTarget, type SearchQuery } from './search'

const query: SearchQuery = {
  destination: 'Прага',
  checkIn: '2026-10-20',
  checkOut: '2026-10-23',
  guests: { adults: 2, children: 0, rooms: 1 },
}
const filters = (patch: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...patch })
const prague = fullHotelsIn('prague')

describe('runDemoSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the hotels of a city after the demo delay', async () => {
    const target = resolveTarget('Прага', destinations)!
    const ids = targetDestinations(target, destinations).map((d) => d.id)
    const pending = runDemoSearch(query, target, loadCityHotels(ids))
    await vi.advanceTimersByTimeAsync(DEMO_SEARCH_MS)
    const result = await pending
    expect(result.nights).toBe(3)
    expect(result.hotels.length).toBeGreaterThanOrEqual(6)
    expect(result.hotels.every((h) => h.destinationId === 'prague')).toBe(true)
  })

  // hotel-catalog, Requirement: Один источник каталога
  it('answers with the given hotels only', async () => {
    const two = prague.slice(0, 2)
    const pending = runDemoSearch(query, resolveTarget('Прага', destinations)!, two)
    await vi.advanceTimersByTimeAsync(DEMO_SEARCH_MS)
    expect((await pending).hotels.map((h) => h.id)).toEqual(two.map((h) => h.id))
  })

  it('rejects with AbortError when aborted', async () => {
    const controller = new AbortController()
    const pending = runDemoSearch(query, resolveTarget('Прага', destinations)!, prague, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('targetDestinations', () => {
  it('is the destination itself', () => {
    expect(targetDestinations(resolveTarget('Прага', destinations)!, destinations).map((d) => d.id)).toEqual(['prague'])
  })

  it('is every destination of a scenario', () => {
    const cities = targetDestinations(resolveTarget('У моря', destinations)!, destinations)
    expect(cities.length).toBeGreaterThan(1)
    expect(cities.every((d) => d.scenarios.includes('sea'))).toBe(true)
  })
})

describe('parseFilters and setFilterParams', () => {
  it('reads the filters it wrote, keeping the query parameters', () => {
    const set = filters({
      priceMin: 5000,
      priceMax: 20000,
      stars: [4, 5],
      ratingMin: 7.5,
      ratingMax: 9,
      meals: ['breakfast', 'all-inclusive'],
      freeCancel: true,
      amenities: ['wifi', 'parking'],
      sort: 'price_asc',
    })
    const params = setFilterParams(new URLSearchParams('destination=prague'), set)
    expect(params.toString()).toBe(
      'destination=prague&price_min=5000&price_max=20000&stars=4%2C5&rating_min=7.5&rating_max=9&meal=breakfast%2Call-inclusive&free_cancel=1&amenities=wifi%2Cparking&sort=price_asc',
    )
    expect(parseFilters(params)).toEqual(set)
  })

  it('writes nothing for no filters and the default sorting, and clears old values', () => {
    const params = setFilterParams(new URLSearchParams('destination=prague&stars=5&sort=rating'), NO_FILTERS)
    expect(params.toString()).toBe('destination=prague')
  })

  it('ignores unknown and malformed values', () => {
    expect(
      parseFilters(
        new URLSearchParams(
          'price_min=abc&price_max=-5&stars=7,5,x&rating_min=7.3&rating_max=11&meal=snacks&free_cancel=yes&amenities=wifi,jacuzzi&sort=cheap',
        ),
      ),
    ).toEqual(filters({ stars: [5], amenities: ['wifi'] }))
  })

  it('reads the old minimal rating as the lower end of the range and writes the new one', () => {
    const params = new URLSearchParams('destination=prague&rating=8')
    expect(parseFilters(params)).toEqual(filters({ ratingMin: 8 }))
    expect(setFilterParams(params, parseFilters(params)).toString()).toBe('destination=prague&rating_min=8')
  })

  it('counts the filters set, without the sorting', () => {
    expect(countFilters(filters({ sort: 'rating' }))).toBe(0)
    expect(countFilters(filters({ priceMin: 1, priceMax: 2, stars: [5, 4], freeCancel: true }))).toBe(3)
    expect(countFilters(filters({ ratingMax: 9, amenities: ['wifi', 'parking'] }))).toBe(2)
  })
})

describe('pages', () => {
  it('counts pages of 12, at least one', () => {
    expect([0, 1, 12, 13, 30].map(pageCount)).toEqual([1, 1, 1, 2, 3])
  })

  it('reads the page, taking the nearest existing one for an invalid value', () => {
    const page = (value: string, pages = 3) => parsePage(new URLSearchParams(value), pages)
    expect(page('page=2')).toBe(2)
    expect(page('')).toBe(1)
    expect(page('page=abc')).toBe(1)
    expect(page('page=1.5')).toBe(1)
    expect(page('page=0')).toBe(1)
    expect(page('page=-4')).toBe(1)
    expect(page('page=9')).toBe(3)
  })

  it('drops the page when the filters or sorting are written, keeping the rest of the query', () => {
    const params = setFilterParams(new URLSearchParams('destination=prague&page=2&hotel=h1'), filters({ stars: [5] }))
    expect(params.toString()).toBe('destination=prague&hotel=h1&stars=5')
  })
})

describe('applyFilters', () => {
  const ids = (hotels: Hotel[]) => hotels.map((h) => h.id).sort()

  it('keeps every hotel without filters', () => {
    expect(ids(applyFilters(prague, NO_FILTERS).map((i) => i.hotel))).toEqual(ids(prague))
  })

  it('shows each hotel with its cheapest rate', () => {
    for (const { hotel, rate } of applyFilters(prague, NO_FILTERS)) expect(rate.pricePerNight).toBe(hotel.priceFrom)
  })

  it('filters by stars and the rating from and to', () => {
    const fiveStars = applyFilters(prague, filters({ stars: [5] }))
    expect(fiveStars.length).toBeGreaterThan(0)
    expect(fiveStars.every((i) => i.hotel.stars === 5)).toBe(true)
    expect(applyFilters(prague, filters({ ratingMin: 9 })).every((i) => i.hotel.rating >= 9)).toBe(true)
    const between = applyFilters(prague, filters({ ratingMin: 8, ratingMax: 9 }))
    expect(between.length).toBeGreaterThan(0)
    expect(between.every((i) => i.hotel.rating >= 8 && i.hotel.rating <= 9)).toBe(true)
    expect(between.length).toBe(prague.filter((h) => h.rating >= 8 && h.rating <= 9).length)
  })

  it('keeps only the hotels with every chosen amenity', () => {
    const both = applyFilters(prague, filters({ amenities: ['parking', 'pool'] }))
    expect(both.length).toBeGreaterThan(0)
    expect(both.every((i) => i.hotel.amenities.includes('parking') && i.hotel.amenities.includes('pool'))).toBe(true)
    expect(both.length).toBeLessThan(applyFilters(prague, filters({ amenities: ['parking'] })).length)
  })

  it('bounds the price slider by the cheapest and the dearest night without filters, in steps of 100 ₽', () => {
    const [min, max] = priceBounds(prague)
    const nights = prague.map((h) => h.priceFrom)
    expect(min).toBe(Math.floor(Math.min(...nights) / 100) * 100)
    expect(max).toBe(Math.ceil(Math.max(...nights) / 100) * 100)
  })

  it('picks the cheapest rate with the chosen meal and free cancellation', () => {
    const items = applyFilters(prague, filters({ meals: ['breakfast'], freeCancel: true }))
    for (const { hotel, rate } of items) {
      expect(rate.meal).toBe('breakfast')
      expect(rate.cancellation.kind).toBe('free')
      const cheapest = Math.min(
        ...hotel.rooms
          .flatMap((r) => r.rates)
          .filter((r) => r.meal === 'breakfast' && r.cancellation.kind === 'free')
          .map((r) => r.pricePerNight),
      )
      expect(rate.pricePerNight).toBe(cheapest)
    }
  })

  it('filters by the price per night of the shown rate', () => {
    const prices = applyFilters(prague, NO_FILTERS).map((i) => i.rate.pricePerNight)
    const [low, high] = [Math.min(...prices), Math.max(...prices)]
    const items = applyFilters(prague, filters({ priceMin: low + 1, priceMax: high - 1 }))
    expect(items.every((i) => i.rate.pricePerNight > low && i.rate.pricePerNight < high)).toBe(true)
    expect(items.length).toBeLessThan(prices.length)
  })

  it('returns nothing when no hotel meets the filters', () => {
    expect(applyFilters(prague, filters({ priceMax: 1 }))).toEqual([])
  })

  it('sorts by popularity, price and rating', () => {
    const sorted = (f: Filters, key: (i: ReturnType<typeof applyFilters>[number]) => number) =>
      applyFilters(prague, f).map(key)
    const desc = (list: number[]) => [...list].sort((a, b) => b - a)
    const reviews = sorted(NO_FILTERS, (i) => i.hotel.reviewCount)
    expect(reviews).toEqual(desc(reviews))
    const asc = sorted(filters({ sort: 'price_asc' }), (i) => i.rate.pricePerNight)
    expect(asc).toEqual([...asc].sort((a, b) => a - b))
    const priceDesc = sorted(filters({ sort: 'price_desc' }), (i) => i.rate.pricePerNight)
    expect(priceDesc).toEqual(desc(priceDesc))
    const ratings = sorted(filters({ sort: 'rating' }), (i) => i.hotel.rating)
    expect(ratings).toEqual(desc(ratings))
  })

  // search-results-page, Requirement: Цена в фильтре и сортировке
  describe('with a stay', () => {
    const weekend: SearchQuery = { ...query, checkIn: '2026-10-23', checkOut: '2026-10-25' }
    const twoRooms: SearchQuery = { ...weekend, guests: { adults: 2, children: 0, rooms: 2 } }

    it('prices each hotel for the stay and rooms', () => {
      for (const { rate, price } of applyFilters(prague, NO_FILTERS, twoRooms))
        expect(price).toBe(stayTotal(rate.pricePerNight, twoRooms.checkIn, twoRooms.checkOut, 2))
      for (const { rate, price } of applyFilters(prague, NO_FILTERS)) expect(price).toBe(rate.pricePerNight)
    })

    it('filters by the average night over the stay', () => {
      const weekday = Math.max(...applyFilters(prague, NO_FILTERS).map((i) => i.rate.pricePerNight))
      expect(applyFilters(prague, filters({ priceMax: weekday }))).toHaveLength(prague.length)
      const kept = applyFilters(prague, filters({ priceMax: weekday }), twoRooms)
      expect(kept.every((i) => nightPrice(i.rate.pricePerNight, weekend.checkIn) <= weekday)).toBe(true)
      expect(kept.length).toBeLessThan(prague.length)
    })

    it('sorts by the offer price for the stay', () => {
      const asc = applyFilters(prague, filters({ sort: 'price_asc' }), twoRooms).map((i) => i.price)
      expect(asc).toEqual([...asc].sort((a, b) => a - b))
      const desc = applyFilters(prague, filters({ sort: 'price_desc' }), twoRooms).map((i) => i.price)
      expect(desc).toEqual([...desc].sort((a, b) => b - a))
    })
  })
})

describe('pageItems', () => {
  it('lists every page up to seven, then the first, the last and the current with neighbours', () => {
    expect(pageItems(2, 3)).toEqual([1, 2, 3])
    expect(pageItems(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(pageItems(1, 9)).toEqual([1, 2, null, 9])
    expect(pageItems(5, 9)).toEqual([1, null, 4, 5, 6, null, 9])
    expect(pageItems(8, 9)).toEqual([1, null, 7, 8, 9])
  })
})
