import { destinations, type Destination } from '../data/destinations'
import {
  AMENITIES,
  fullHotelsIn,
  getDestination,
  MEAL_LABEL,
  type Amenity,
  type Hotel,
  type Meal,
  type Rate,
  type Room,
} from './catalog'
import { nightsBetween } from './dates'
import { averageNight, stayTotal } from './offer'
import type { SearchQuery, SearchTarget, Stay } from './search'

/**
 * Search results page: the demo search over the hotel catalogue, and the filters and sorting the
 * page keeps in its URL (`price_min`, `price_max`, `stars`, `rating_min`, `rating_max`, `meal`, `free_cancel`,
 * `amenities`, `sort`).
 */

export interface SearchResult {
  query: SearchQuery
  target: SearchTarget
  nights: number
  /** Hotels of the destination, or of every destination of the scenario. */
  hotels: Hotel[]
}

export const DEMO_SEARCH_MS = 700

/** Demo search: there is no backend, so the hotels come from the local catalogue after a short delay. */
export async function runDemoSearch(
  query: SearchQuery,
  target: SearchTarget,
  signal?: AbortSignal,
): Promise<SearchResult> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, DEMO_SEARCH_MS)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
  const matches =
    target.kind === 'destination'
      ? [target.destination]
      : destinations.filter((d) => d.scenarios.includes(target.scenario))
  return {
    query,
    target,
    nights: nightsBetween(query.checkIn, query.checkOut),
    hotels: matches.flatMap((d) => fullHotelsIn(d.id)),
  }
}

// ---------------------------------------------------------------------------------------------
// Filters and sorting

export const SORTS = {
  popular: 'Сначала популярные',
  price_asc: 'Сначала дешевле',
  price_desc: 'Сначала дороже',
  rating: 'По рейтингу',
} as const

export type Sort = keyof typeof SORTS

export const STAR_OPTIONS = [1, 2, 3, 4, 5] as const
/** The guest rating slider: from 0 to 10 in halves. */
export const RATING_SCALE = { min: 0, max: 10, step: 0.5 } as const
export const MEAL_OPTIONS = Object.keys(MEAL_LABEL) as Meal[]
export const AMENITY_OPTIONS = Object.keys(AMENITIES) as Amenity[]
/** The price slider moves in steps of this many roubles. */
export const PRICE_STEP = 100

export interface Filters {
  /** Price per night of one room, ₽, averaged over the stay; `null` is no bound. */
  priceMin: number | null
  priceMax: number | null
  /** Empty: any. */
  stars: number[]
  /** Guest rating from and to; `null` is no bound. */
  ratingMin: number | null
  ratingMax: number | null
  /** Empty: any. */
  meals: Meal[]
  freeCancel: boolean
  /** The hotel must have every one of them; empty: any. */
  amenities: Amenity[]
  sort: Sort
}

export const NO_FILTERS: Filters = {
  priceMin: null,
  priceMax: null,
  stars: [],
  ratingMin: null,
  ratingMax: null,
  meals: [],
  freeCancel: false,
  amenities: [],
  sort: 'popular',
}

/** Hotels on one page of the list. */
export const PAGE_SIZE = 12
/** The page of the list, `?page=2`; not a filter, but any change of the filters or sorting drops it. */
export const PAGE_PARAM = 'page'

/** `rating` is the old minimal rating: read as `rating_min`, never written. */
export const FILTER_PARAMS = [
  'price_min',
  'price_max',
  'stars',
  'rating',
  'rating_min',
  'rating_max',
  'meal',
  'free_cancel',
  'amenities',
  'sort',
] as const

const toPrice = (value: string | null) => (value && /^\d+$/.test(value) ? Number(value) : null)
const list = (value: string | null) => (value ? value.split(',') : [])
const toRating = (value: string | null) => {
  if (!value || !/^\d+(\.\d+)?$/.test(value)) return null
  const rating = Number(value)
  return rating <= RATING_SCALE.max && rating % RATING_SCALE.step === 0 ? rating : null
}

/** Reads the filters and sorting from the URL; unknown or malformed values are ignored. */
export function parseFilters(params: Pick<URLSearchParams, 'get'>): Filters {
  const sort = params.get('sort')
  return {
    priceMin: toPrice(params.get('price_min')),
    priceMax: toPrice(params.get('price_max')),
    stars: STAR_OPTIONS.filter((s) => list(params.get('stars')).includes(String(s))),
    ratingMin: toRating(params.get('rating_min') ?? params.get('rating')),
    ratingMax: toRating(params.get('rating_max')),
    meals: MEAL_OPTIONS.filter((m) => list(params.get('meal')).includes(m)),
    freeCancel: params.get('free_cancel') === '1',
    amenities: AMENITY_OPTIONS.filter((a) => list(params.get('amenities')).includes(a)),
    sort: sort && sort in SORTS ? (sort as Sort) : 'popular',
  }
}

export const pageCount = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE))

/** Reads the page from the URL: the nearest existing one for a missing, malformed or out-of-range value. */
export function parsePage(params: Pick<URLSearchParams, 'get'>, pages: number): number {
  const value = Number(params.get(PAGE_PARAM))
  return Number.isInteger(value) ? Math.min(Math.max(value, 1), pages) : 1
}

/** Page numbers to show: all up to 7, otherwise the first, the last and the current with its neighbours; `null` is a gap. */
export function pageItems(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const shown = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b)
  return shown.flatMap((n, i) => (i > 0 && n - shown[i - 1] > 1 ? [null, n] : [n]))
}

/**
 * Writes the filters that are set (and a sorting other than the default) over `params`.
 * Any change of them returns to the first page, so the page is dropped.
 */
export function setFilterParams(params: URLSearchParams, filters: Filters): URLSearchParams {
  for (const name of [...FILTER_PARAMS, PAGE_PARAM]) params.delete(name)
  if (filters.priceMin !== null) params.set('price_min', String(filters.priceMin))
  if (filters.priceMax !== null) params.set('price_max', String(filters.priceMax))
  if (filters.stars.length) params.set('stars', filters.stars.join(','))
  if (filters.ratingMin !== null) params.set('rating_min', String(filters.ratingMin))
  if (filters.ratingMax !== null) params.set('rating_max', String(filters.ratingMax))
  if (filters.meals.length) params.set('meal', filters.meals.join(','))
  if (filters.freeCancel) params.set('free_cancel', '1')
  if (filters.amenities.length) params.set('amenities', filters.amenities.join(','))
  if (filters.sort !== 'popular') params.set('sort', filters.sort)
  return params
}

/** How many filters are set; the sorting does not count. */
export const countFilters = (f: Filters) =>
  Number(f.priceMin !== null || f.priceMax !== null) +
  Number(f.stars.length > 0) +
  Number(f.ratingMin !== null || f.ratingMax !== null) +
  Number(f.meals.length > 0) +
  Number(f.freeCancel) +
  Number(f.amenities.length > 0)

export interface ResultItem {
  hotel: Hotel
  destination: Destination
  /** The cheapest rate that meets the meal and cancellation filters, and its room. */
  room: Room
  rate: Rate
  /** The offer price for the stay and all rooms; without a stay, the weekday price per night. */
  price: number
}

const rateMatches = (rate: Rate, f: Filters) =>
  (f.meals.length === 0 || f.meals.includes(rate.meal)) && (!f.freeCancel || rate.cancellation.kind === 'free')

type Best = Pick<ResultItem, 'room' | 'rate' | 'price'>

function bestRate(hotel: Hotel, f: Filters, stay: Stay | null): Best | null {
  let best: Best | null = null
  for (const room of hotel.rooms)
    for (const rate of room.rates) {
      if (!rateMatches(rate, f)) continue
      const price = stay
        ? stayTotal(rate.pricePerNight, stay.checkIn, stay.checkOut, stay.guests.rooms)
        : rate.pricePerNight
      if (!best || price < best.price) best = { room, rate, price }
    }
  return best
}

const compare: Record<Sort, (a: ResultItem, b: ResultItem) => number> = {
  popular: (a, b) => b.hotel.reviewCount - a.hotel.reviewCount || b.hotel.rating - a.hotel.rating,
  price_asc: (a, b) => a.price - b.price,
  price_desc: (a, b) => b.price - a.price,
  rating: (a, b) => b.hotel.rating - a.hotel.rating || b.hotel.reviewCount - a.hotel.reviewCount,
}

/** The average night of one room the price filter takes: the offer price over the stay and rooms. */
const filterPrice = (price: number, stay: Stay | null) =>
  stay ? averageNight(price, nightsBetween(stay.checkIn, stay.checkOut), stay.guests.rooms) : price

/**
 * The ends of the price slider: the cheapest and the dearest night among the hotels without filters,
 * widened to whole steps of the slider.
 */
export function priceBounds(hotels: Hotel[], stay: Stay | null = null): [number, number] {
  const prices = applyFilters(hotels, NO_FILTERS, stay).map((item) => filterPrice(item.price, stay))
  if (prices.length === 0) return [0, PRICE_STEP]
  const min = Math.floor(Math.min(...prices) / PRICE_STEP) * PRICE_STEP
  return [min, Math.max(Math.ceil(Math.max(...prices) / PRICE_STEP) * PRICE_STEP, min + PRICE_STEP)]
}

/**
 * Hotels that meet the filters, sorted. Each hotel is shown with its cheapest rate for the stay among
 * those with the chosen meals and cancellation; the price filter takes its average night, the price
 * sorting its offer price. Without a stay both use the weekday price per night.
 */
export function applyFilters(hotels: Hotel[], f: Filters, stay: Stay | null = null): ResultItem[] {
  const items: ResultItem[] = []
  for (const hotel of hotels) {
    if (f.stars.length && !f.stars.includes(hotel.stars)) continue
    if (f.ratingMin !== null && hotel.rating < f.ratingMin) continue
    if (f.ratingMax !== null && hotel.rating > f.ratingMax) continue
    if (!f.amenities.every((a) => hotel.amenities.includes(a))) continue
    const best = bestRate(hotel, f, stay)
    if (!best) continue
    const price = filterPrice(best.price, stay)
    if ((f.priceMin !== null && price < f.priceMin) || (f.priceMax !== null && price > f.priceMax)) continue
    items.push({ hotel, destination: getDestination(hotel.destinationId)!, ...best })
  }
  return items.sort(compare[f.sort])
}
