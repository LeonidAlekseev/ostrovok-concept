import { destinations, type Destination } from '../data/destinations'
import { fullHotelsIn, getDestination, MEAL_LABEL, type Hotel, type Meal, type Rate, type Room } from './catalog'
import { nightsBetween } from './dates'
import type { SearchQuery, SearchTarget } from './search'

/**
 * Search results page: the demo search over the hotel catalogue, and the filters and sorting the
 * page keeps in its URL (`price_min`, `price_max`, `stars`, `rating`, `meal`, `free_cancel`, `sort`).
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

export const STAR_OPTIONS = [5, 4, 3, 2, 1] as const
export const RATING_OPTIONS = [9, 8, 7, 6] as const
export const MEAL_OPTIONS = Object.keys(MEAL_LABEL) as Meal[]

export interface Filters {
  /** Price per night of one room, ₽; `null` is no bound. */
  priceMin: number | null
  priceMax: number | null
  /** Empty: any. */
  stars: number[]
  /** Minimal guest rating; `null` is any. */
  rating: number | null
  /** Empty: any. */
  meals: Meal[]
  freeCancel: boolean
  sort: Sort
}

export const NO_FILTERS: Filters = {
  priceMin: null,
  priceMax: null,
  stars: [],
  rating: null,
  meals: [],
  freeCancel: false,
  sort: 'popular',
}

export const FILTER_PARAMS = ['price_min', 'price_max', 'stars', 'rating', 'meal', 'free_cancel', 'sort'] as const

const toPrice = (value: string | null) => (value && /^\d+$/.test(value) ? Number(value) : null)
const list = (value: string | null) => (value ? value.split(',') : [])
const isOneOf = <T>(options: readonly T[], value: unknown): value is T => options.includes(value as T)

/** Reads the filters and sorting from the URL; unknown or malformed values are ignored. */
export function parseFilters(params: Pick<URLSearchParams, 'get'>): Filters {
  const rating = Number(params.get('rating'))
  const sort = params.get('sort')
  return {
    priceMin: toPrice(params.get('price_min')),
    priceMax: toPrice(params.get('price_max')),
    stars: STAR_OPTIONS.filter((s) => list(params.get('stars')).includes(String(s))),
    rating: isOneOf(RATING_OPTIONS, rating) ? rating : null,
    meals: MEAL_OPTIONS.filter((m) => list(params.get('meal')).includes(m)),
    freeCancel: params.get('free_cancel') === '1',
    sort: sort && sort in SORTS ? (sort as Sort) : 'popular',
  }
}

/** Writes the filters that are set (and a sorting other than the default) over `params`. */
export function setFilterParams(params: URLSearchParams, filters: Filters): URLSearchParams {
  for (const name of FILTER_PARAMS) params.delete(name)
  if (filters.priceMin !== null) params.set('price_min', String(filters.priceMin))
  if (filters.priceMax !== null) params.set('price_max', String(filters.priceMax))
  if (filters.stars.length) params.set('stars', filters.stars.join(','))
  if (filters.rating !== null) params.set('rating', String(filters.rating))
  if (filters.meals.length) params.set('meal', filters.meals.join(','))
  if (filters.freeCancel) params.set('free_cancel', '1')
  if (filters.sort !== 'popular') params.set('sort', filters.sort)
  return params
}

/** How many filters are set; the sorting does not count. */
export const countFilters = (f: Filters) =>
  Number(f.priceMin !== null || f.priceMax !== null) +
  Number(f.stars.length > 0) +
  Number(f.rating !== null) +
  Number(f.meals.length > 0) +
  Number(f.freeCancel)

export interface ResultItem {
  hotel: Hotel
  destination: Destination
  /** The cheapest rate that meets the meal and cancellation filters, and its room. */
  room: Room
  rate: Rate
}

const rateMatches = (rate: Rate, f: Filters) =>
  (f.meals.length === 0 || f.meals.includes(rate.meal)) && (!f.freeCancel || rate.cancellation.kind === 'free')

function bestRate(hotel: Hotel, f: Filters): { room: Room; rate: Rate } | null {
  let best: { room: Room; rate: Rate } | null = null
  for (const room of hotel.rooms)
    for (const rate of room.rates)
      if (rateMatches(rate, f) && (!best || rate.pricePerNight < best.rate.pricePerNight)) best = { room, rate }
  return best
}

const compare: Record<Sort, (a: ResultItem, b: ResultItem) => number> = {
  popular: (a, b) => b.hotel.reviewCount - a.hotel.reviewCount || b.hotel.rating - a.hotel.rating,
  price_asc: (a, b) => a.rate.pricePerNight - b.rate.pricePerNight,
  price_desc: (a, b) => b.rate.pricePerNight - a.rate.pricePerNight,
  rating: (a, b) => b.hotel.rating - a.hotel.rating || b.hotel.reviewCount - a.hotel.reviewCount,
}

/**
 * Hotels that meet the filters, sorted. Each hotel is shown with its cheapest rate among those with
 * the chosen meals and cancellation; the price filter and the price sorting use that rate.
 */
export function applyFilters(hotels: Hotel[], f: Filters): ResultItem[] {
  const items: ResultItem[] = []
  for (const hotel of hotels) {
    if (f.stars.length && !f.stars.includes(hotel.stars)) continue
    if (f.rating !== null && hotel.rating < f.rating) continue
    const best = bestRate(hotel, f)
    if (!best) continue
    const price = best.rate.pricePerNight
    if ((f.priceMin !== null && price < f.priceMin) || (f.priceMax !== null && price > f.priceMax)) continue
    items.push({ hotel, destination: getDestination(hotel.destinationId)!, ...best })
  }
  return items.sort(compare[f.sort])
}
