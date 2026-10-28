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
    const priced = inValencia.filter((h) => h.priceFrom > 0).map((h) => h.priceFrom)
    const student = personaHotels(hotels, 'student')
    expect(student[0].priceFrom).toBe(Math.min(...priced))
    expect(student.map((h) => h.priceFrom)).toEqual(student.map((h) => h.priceFrom).toSorted((a, b) => a - b))

    const luxury = personaHotels(hotels, 'luxury')
    expect(luxury[0].priceFrom).toBe(Math.max(...priced))
    expect(luxury.map((h) => h.priceFrom)).toEqual(luxury.map((h) => h.priceFrom).toSorted((a, b) => b - a))

    // Scenario: Смена персоны
    const workation = personaHotels(hotels, 'workation')
    expect(workation.every((h) => h.workspace)).toBe(true)
    expect(workation[0].wifiMbps).toBe(Math.max(...inValencia.filter((h) => h.workspace).map((h) => h.wifiMbps ?? 0)))

    const culture = personaHotels(hotels, 'culture')
    expect(culture[0].distanceKm).toBe(Math.min(...inValencia.map((h) => h.distanceKm)))
    expect(culture.map((h) => h.distanceKm)).toEqual(culture.map((h) => h.distanceKm).toSorted((a, b) => a - b))
  })

  it('is the same for the same catalogue', () => {
    expect(personaHotels(hotels, 'culture').map((h) => h.id)).toEqual(
      personaHotels([...hotels], 'culture').map((h) => h.id),
    )
  })
})
