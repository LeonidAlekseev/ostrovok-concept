import { hasStars, type Hotel } from './catalog'

/**
 * How much each parameter weighs in the difference of two hotels; a parameter's own difference is 0…1.
 * The kind of stay and the price matter most for a replacement, the distance to the centre least.
 */
const WEIGHT = { type: 3, price: 3, stars: 2, rating: 2, amenities: 1.5, distance: 1, profile: 2 }

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** 0 for the same set of amenities, 1 for none in common (Jaccard distance). */
function amenityDistance(a: readonly string[], b: readonly string[]): number {
  const left = new Set(a)
  const shared = b.filter((amenity) => left.has(amenity)).length
  const union = left.size + b.length - shared
  return union === 0 ? 0 : 1 - shared / union
}

/** The difference of a candidate from the current hotel: 0 for a twin, the sum of the weights at most. */
function difference(current: Hotel, candidate: Hotel): number {
  const stars =
    hasStars(current.stayType) && hasStars(candidate.stayType) ? Math.abs(current.stars - candidate.stars) / 4 : 0
  return (
    WEIGHT.type * (current.stayType === candidate.stayType ? 0 : 1) +
    // Twice or half the price is as far as it gets.
    WEIGHT.price * clamp01(Math.abs(Math.log2(candidate.priceFrom / current.priceFrom))) +
    WEIGHT.stars * stars +
    WEIGHT.rating * clamp01(Math.abs(current.rating - candidate.rating) / 2) +
    WEIGHT.amenities * amenityDistance(current.amenities, candidate.amenities) +
    WEIGHT.distance * clamp01(Math.abs(current.distanceKm - candidate.distanceKm) / 5)
  )
}

/**
 * The replacements of a stop's hotel, the most alike first: the kind of stay, the stars, the rating, the
 * price, the amenities in common and the distance to the centre. `profile` (0…1, how well a hotel suits the
 * user) moves the hotels the user would like up: the embeddings of the hotels and the user plug in here.
 * Only the hotels of the same city count, the current one and the `taken` ones (the other stops' hotels) left out; equally alike hotels keep the order of `candidates`.
 */
export function rankHotelAlternatives(
  current: Hotel,
  candidates: readonly Hotel[],
  profile?: (hotel: Hotel) => number,
  taken: ReadonlySet<string> = new Set(),
): Hotel[] {
  return candidates
    .filter((hotel) => hotel.id !== current.id && !taken.has(hotel.id) && hotel.destinationId === current.destinationId)
    .map((hotel, order) => ({
      hotel,
      order,
      score: difference(current, hotel) - (profile ? WEIGHT.profile * clamp01(profile(hotel)) : 0),
    }))
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .map(({ hotel }) => hotel)
}
