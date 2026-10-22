import type { Hotel, Meal } from './catalog'

/** Hotels per collection. */
export const COLLECTION_SIZE = 4

/** Meals that include breakfast. */
const WITH_BREAKFAST: Meal[] = ['breakfast', 'half-board', 'full-board', 'all-inclusive']

const rates = (hotel: Hotel) => hotel.rooms.flatMap((room) => room.rates)

export interface Collection {
  id: string
  title: string
  description: string
  matches: (hotel: Hotel) => boolean
}

export const COLLECTIONS: readonly Collection[] = [
  {
    id: 'rating-9',
    title: 'Рейтинг 9+',
    description: 'Отели, которые гости оценили на 9,0 и выше',
    matches: (hotel) => hotel.rating >= 9,
  },
  {
    id: 'free-cancellation',
    title: 'Бесплатная отмена',
    description: 'Отели с тарифом, который можно отменить без штрафа',
    matches: (hotel) => rates(hotel).some((rate) => rate.cancellation.kind === 'free'),
  },
  {
    id: 'breakfast',
    title: 'С завтраком',
    description: 'Отели с тарифом, в который входит завтрак',
    matches: (hotel) => rates(hotel).some((rate) => WITH_BREAKFAST.includes(rate.meal)),
  },
  {
    id: 'budget',
    title: 'До 8 000 ₽ за ночь',
    description: 'Отели, где номер стоит не дороже 8 000 ₽ за ночь',
    matches: (hotel) => hotel.priceFrom <= 8000,
  },
]

/** Best rated first, then cheaper first, then by id so the order never depends on the input. */
const byRatingThenPrice = (a: Hotel, b: Hotel) =>
  b.rating - a.rating || a.priceFrom - b.priceFrom || a.id.localeCompare(b.id)

/**
 * Hotels of one collection: the best matches, at most one per destination, so the cards come from
 * different cities, and none of the `taken` hotels shown by earlier collections. Fewer than
 * COLLECTION_SIZE if the catalogue has too few matches left.
 */
export function pickCollection(
  collection: Collection,
  catalogue: readonly Hotel[],
  taken: ReadonlySet<string> = new Set(),
): Hotel[] {
  const cities = new Set<string>()
  const picked: Hotel[] = []
  const candidates = catalogue.filter((hotel) => !taken.has(hotel.id) && collection.matches(hotel))
  for (const hotel of candidates.sort(byRatingThenPrice)) {
    if (cities.has(hotel.destinationId)) continue
    cities.add(hotel.destinationId)
    picked.push(hotel)
    if (picked.length === COLLECTION_SIZE) break
  }
  return picked
}

export interface HomeCollection {
  collection: Collection
  hotels: Hotel[]
}

/** The home page collections over the catalogue, in order; a hotel appears in one collection only. */
export function homeCollections(catalogue: readonly Hotel[]): HomeCollection[] {
  const shown = new Set<string>()
  return COLLECTIONS.map((collection) => {
    const picked = pickCollection(collection, catalogue, shown)
    for (const hotel of picked) shown.add(hotel.id)
    return { collection, hotels: picked }
  })
}
