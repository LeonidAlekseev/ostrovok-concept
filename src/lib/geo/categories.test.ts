import { describe, expect, it } from 'vitest'
import { PLACE_CATEGORIES, categorize, overpassStatements, shapeFilters } from './categories'

// assistant-geo, Requirement: Кэш мест OpenStreetMap
describe('the categories', () => {
  it('reads the medicine, the drinks and the shops', () => {
    expect(categorize({ amenity: 'pharmacy' })).toEqual(['pharmacy'])
    expect(categorize({ healthcare: 'hospital' })).toEqual(['hospital'])
    expect(categorize({ amenity: 'pub' })).toEqual(['bar'])
    expect(categorize({ amenity: 'nightclub' })).toEqual(['nightclub'])
    expect(categorize({ shop: 'supermarket' })).toEqual(['supermarket'])
  })

  it('tells the metro, the tram and the train apart', () => {
    expect(categorize({ railway: 'station', station: 'subway' })).toEqual(['metro'])
    expect(categorize({ railway: 'station', subway: 'yes' })).toEqual(['metro'])
    expect(categorize({ railway: 'tram_stop' })).toEqual(['tram'])
    expect(categorize({ railway: 'station', station: 'light_rail' })).toEqual(['tram'])
    expect(categorize({ railway: 'station', train: 'yes' })).toEqual(['train_station'])
    expect(categorize({ railway: 'station', station: 'funicular' })).toEqual([])
  })

  it('gives an element all its categories', () => {
    expect(categorize({ amenity: 'restaurant', tourism: 'attraction' })).toEqual(['restaurant', 'attraction'])
  })

  it('gives none for other tags', () => {
    expect(categorize({ shop: 'bakery' })).toEqual([])
    expect(categorize({})).toEqual([])
  })

  it('asks Overpass for each statement once', () => {
    const statements = overpassStatements(['metro', 'tram', 'train_station'], '(around:500,39.4,-0.3)')
    expect(statements).toEqual(['nwr["railway"~"^(station|halt|tram_stop)$"](around:500,39.4,-0.3);'])
    expect(overpassStatements(['pharmacy'], '')).toEqual([
      'nwr["amenity"="pharmacy"];',
      'nwr["healthcare"="pharmacy"];',
    ])
  })

  it('keeps the shapes of beaches, the coast and parks only', () => {
    expect(shapeFilters(PLACE_CATEGORIES)).toEqual([
      '["natural"="beach"]',
      '["natural"="coastline"]',
      '["leisure"="park"]',
    ])
    expect(shapeFilters(['bar'])).toEqual([])
  })
})
