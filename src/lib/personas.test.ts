import { describe, expect, it } from 'vitest'
import { valenciaHotels } from '@/test/catalog'
import { PERSONA_CITY, PERSONA_HOTELS, PERSONAS, personaHotels } from './personas'

const hotels = valenciaHotels()
const inValencia = hotels.filter((h) => h.destinationId === PERSONA_CITY)

// home-page, Requirement: Отели персоны
describe('personaHotels', () => {
  it('gives every persona a full selection of Valencia hotels only', () => {
    expect(inValencia.length).toBeLessThan(hotels.length)
    for (const persona of PERSONAS) {
      const picks = personaHotels(hotels, persona)
      expect(picks).toHaveLength(PERSONA_HOTELS)
      expect(PERSONA_HOTELS).toBe(3)
      expect(picks.every((h) => h.destinationId === PERSONA_CITY)).toBe(true)
    }
  })

  it('reads each persona by its rule, the best for it first', () => {
    const student = personaHotels(hotels, 'student')
    expect(student.every((h) => h.rating >= 7)).toBe(true)
    expect(student[0].priceFrom).toBe(Math.min(...inValencia.filter((h) => h.rating >= 7).map((h) => h.priceFrom)))

    const luxury = personaHotels(hotels, 'luxury')
    expect(luxury.every((h) => h.stayType === 'hotel' && h.stars === 5)).toBe(true)
    expect(luxury.map((h) => h.rating)).toEqual(luxury.map((h) => h.rating).toSorted((a, b) => b - a))

    // Scenario: Смена персоны
    const workation = personaHotels(hotels, 'workation')
    expect(workation.every((h) => h.workspace)).toBe(true)
    expect(workation[0].wifiMbps).toBe(Math.max(...inValencia.filter((h) => h.workspace).map((h) => h.wifiMbps ?? 0)))

    const culture = personaHotels(hotels, 'culture')
    expect(culture.every((h) => h.rating >= 8)).toBe(true)
    expect(culture.map((h) => h.distanceKm)).toEqual(culture.map((h) => h.distanceKm).toSorted((a, b) => a - b))
  })

  it('is the same for the same catalogue', () => {
    expect(personaHotels(hotels, 'culture').map((h) => h.id)).toEqual(
      personaHotels([...hotels], 'culture').map((h) => h.id),
    )
  })
})
