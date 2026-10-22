// routes, Requirement: Демо-маршруты по персонам; Доп. отели от модели
import { describe, expect, it } from 'vitest'
import { PERSONAS, parseRoute } from '../lib/routes'
import { buildCatalog } from '../lib/catalogGenerator'
import extraHotels from './extraHotels.json'
import { seedRoutes } from './routes'

const catalog = buildCatalog()
const ids = new Set(catalog.map((hotel) => hotel.id))

describe('demo routes', () => {
  it('every route passes parseRoute (Scenario: Все маршруты валидны)', () => {
    for (const route of seedRoutes) expect(() => parseRoute(route, (id) => ids.has(id)), route.id).not.toThrow()
  })

  it('has unique ids and stops in the route’s city', () => {
    expect(new Set(seedRoutes.map((route) => route.id)).size).toBe(seedRoutes.length)
    for (const route of seedRoutes)
      for (const stop of route.stops)
        expect(catalog.find((h) => h.id === stop.hotelId)?.destinationId, route.id).toBe(route.destinationId)
  })

  it('has 3 or more routes a persona in different cities (Scenario: Маршруты каждой персоны в разных городах)', () => {
    for (const persona of PERSONAS) {
      const own = seedRoutes.filter((route) => route.persona === persona)
      expect(own.length, persona).toBeGreaterThanOrEqual(3)
      expect(new Set(own.map((route) => route.destinationId)).size, persona).toBe(own.length)
    }
  })

  it('splits the authors about half and half', () => {
    const people = seedRoutes.filter((route) => route.author.kind === 'person')
    expect(people.length).toBeGreaterThanOrEqual(seedRoutes.length / 2 - 1)
    expect(people.length).toBeLessThanOrEqual(seedRoutes.length / 2 + 1)
    const names = people.map((route) => (route.author.kind === 'person' ? route.author.name : ''))
    expect(new Set(names).size).toBeGreaterThanOrEqual(4)
  })

  it('says the nights of the title and description as the stops add up', () => {
    const WORDS: Record<string, number> = {
      одну: 1,
      две: 2,
      три: 3,
      четыре: 4,
      пять: 5,
      шесть: 6,
      семь: 7,
      девять: 9,
      десять: 10,
    }
    for (const route of seedRoutes) {
      const total = route.stops.reduce((sum, stop) => sum + stop.nights, 0)
      const allowed = new Set([total, ...route.stops.map((stop) => stop.nights)])
      for (const [, word] of `${route.title} ${route.description}`.toLowerCase().matchAll(/([а-яё]+) ноч/g))
        expect(allowed.has(WORDS[word]), `${route.id}: «${word} ноч…»`).toBe(true)
      expect(
        route.leisure.every((item) => item.day <= total + 1),
        route.id,
      ).toBe(true)
    }
  })

  it('has no two empty days in a row', () => {
    for (const route of seedRoutes) {
      const days = new Set(route.leisure.map((item) => item.day))
      const total = route.stops.reduce((sum, stop) => sum + stop.nights, 0)
      for (let day = 1; day < total + 1; day++)
        expect(days.has(day) || days.has(day + 1), `${route.id}: дни ${day}–${day + 1}`).toBe(true)
    }
  })

  it('keeps every extra hotel in the catalogue (Scenario: Доп. отель в каталоге)', () => {
    for (const extra of extraHotels)
      expect(
        catalog.some((h) => h.destinationId === extra.destinationId && h.name === extra.name),
        extra.name,
      ).toBe(true)
  })
})
