import { describe, expect, it } from 'vitest'
import { buildCatalog, hotels as summaries } from './catalog'
import { COLLECTION_SIZE, COLLECTIONS, homeCollections, pickCollection } from './collections'

const catalogue = buildCatalog()

describe('home collections', () => {
  it('has four collections, each with a full set of hotels from different cities', () => {
    expect(homeCollections.map((c) => c.collection.id)).toEqual(COLLECTIONS.map((c) => c.id))
    for (const { collection, hotels } of homeCollections) {
      expect(hotels, collection.id).toHaveLength(COLLECTION_SIZE)
      expect(new Set(hotels.map((h) => h.destinationId)).size, collection.id).toBe(COLLECTION_SIZE)
    }
  })

  it('takes only hotels that match the collection condition', () => {
    for (const { collection, hotels } of homeCollections) {
      for (const hotel of hotels) expect(collection.matches(hotel), `${collection.id}: ${hotel.id}`).toBe(true)
    }
  })

  it('is deterministic', () => {
    // The first collection has nothing taken before it, so it matches a fresh pick.
    const again = pickCollection(COLLECTIONS[0], catalogue).map((h) => h.id)
    expect(again).toEqual(homeCollections[0].hotels.map((h) => h.id))
  })

  it('ranks by rating, then by price', () => {
    const rating = homeCollections.find((c) => c.collection.id === 'rating-9')!.hotels
    const sorted = [...rating].sort((a, b) => b.rating - a.rating || a.priceFrom - b.priceFrom)
    expect(rating.map((h) => h.id)).toEqual(sorted.map((h) => h.id))
  })

  it('keeps only one hotel per city', () => {
    const picked = pickCollection(COLLECTIONS[0], catalogue)
    const best = catalogue
      .filter(COLLECTIONS[0].matches)
      .sort((a, b) => b.rating - a.rating || a.priceFrom - b.priceFrom)
    expect(picked[0].id).toBe(best[0].id)
    expect(new Set(picked.map((h) => h.destinationId)).size).toBe(picked.length)
  })

  it('shows a hotel in one collection only', () => {
    const ids = homeCollections.flatMap((c) => c.hotels.map((h) => h.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('skips taken hotels when picking', () => {
    const first = pickCollection(COLLECTIONS[0], catalogue)
    const taken = new Set(first.map((h) => h.id))
    const next = pickCollection(COLLECTIONS[0], catalogue, taken)
    expect(next.some((h) => taken.has(h.id))).toBe(false)
  })

  it('uses hotels that exist in the catalogue', () => {
    const ids = new Set(summaries.map((h) => h.id))
    for (const { hotels } of homeCollections) for (const hotel of hotels) expect(ids.has(hotel.id)).toBe(true)
  })
})
