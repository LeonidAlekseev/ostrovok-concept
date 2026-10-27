import { describe, expect, it } from 'vitest'
import { haversineMeters, straightLine, walkSeconds } from './distance'

const cityHall = { lat: 39.4697065, lon: -0.3763353 }
const malvarrosa = { lat: 39.4783, lon: -0.3238 }

// assistant-geo, Requirement: Гео-инструменты Эвала
describe('the haversine distance', () => {
  it('is 0 for the same point and the same both ways', () => {
    expect(haversineMeters(cityHall, cityHall)).toBe(0)
    expect(haversineMeters(cityHall, malvarrosa)).toBeCloseTo(haversineMeters(malvarrosa, cityHall), 6)
  })

  it('gives a degree of the equator and of a meridian as 111.2 km', () => {
    expect(haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111_195, 0)
    expect(haversineMeters({ lat: 10, lon: 5 }, { lat: 11, lon: 5 })).toBeCloseTo(111_195, 0)
  })

  it('gives the city hall of Valencia to the Malvarrosa beach as about 4.6 km', () => {
    expect(haversineMeters(cityHall, malvarrosa)).toBeGreaterThan(4500)
    expect(haversineMeters(cityHall, malvarrosa)).toBeLessThan(4700)
  })

  it('holds at the antipodes', () => {
    expect(haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 180 })).toBeCloseTo(Math.PI * 6_371_000, 0)
  })
})

describe('the helpers', () => {
  it('walks 5 km in an hour', () => expect(walkSeconds(5000)).toBe(3600))

  it('draws the straight line as GeoJSON lon, lat', () => {
    expect(straightLine(cityHall, malvarrosa)).toEqual({
      type: 'LineString',
      coordinates: [
        [cityHall.lon, cityHall.lat],
        [malvarrosa.lon, malvarrosa.lat],
      ],
    })
  })
})
