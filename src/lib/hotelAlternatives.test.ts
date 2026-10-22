import { describe, expect, it } from 'vitest'
import type { Hotel } from './catalog'
import { fullHotelsIn, getHotel } from './catalogGenerator'
import { rankHotelAlternatives } from './hotelAlternatives'

const current = getHotel('prague-mala-strana-residence')!
const city = fullHotelsIn('prague')
const twin = (id: string, changes: Partial<Hotel> = {}): Hotel => ({ ...current, id, ...changes })

// trip-plan, Requirement: Замена отеля
describe('rankHotelAlternatives', () => {
  it('leaves out the current hotel and hotels of other cities', () => {
    const ranked = rankHotelAlternatives(current, [...city, ...fullHotelsIn('rome')])
    expect(ranked).toHaveLength(city.length - 1)
    expect(ranked.every((h) => h.destinationId === 'prague' && h.id !== current.id)).toBe(true)
  })

  it('puts the most alike first: same type, price, stars, rating, amenities and distance', () => {
    const ranked = rankHotelAlternatives(current, [
      twin('far', { distanceKm: current.distanceKm + 10 }),
      twin('villa', { stayType: current.stayType === 'villa' ? 'hostel' : 'villa' }),
      twin('dear', { priceFrom: current.priceFrom * 2, rating: current.rating - 1 }),
      twin('same'),
      twin('bare', { amenities: [] }),
    ])
    expect(ranked.map((h) => h.id)).toEqual(['same', 'far', 'bare', 'villa', 'dear'])
  })

  it('keeps the order of the candidates for equally alike hotels', () => {
    expect(rankHotelAlternatives(current, [twin('b'), twin('a')]).map((h) => h.id)).toEqual(['b', 'a'])
  })

  it('moves up the hotels the profile likes', () => {
    const ranked = rankHotelAlternatives(
      current,
      [twin('dear', { priceFrom: current.priceFrom * 1.2 }), twin('same')],
      (h) => (h.id === 'dear' ? 1 : 0),
    )
    expect(ranked[0].id).toBe('dear')
  })
})
