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

  it('takes a named city or town as a centre', () => {
    expect(categorize({ place: 'city', name: 'València' })).toEqual(['centre'])
    expect(categorize({ place: 'town', name: 'Burjassot' })).toEqual(['centre'])
    expect(categorize({ place: 'town' })).toEqual([])
    expect(categorize({ place: 'village', name: 'El Palmar' })).toEqual([])
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

  it('takes only the coastline of the sea for the sea, not a river, a riverbank or a lake', () => {
    expect(categorize({ natural: 'coastline' })).toEqual(['sea'])
    const notSea: Record<string, string>[] = [
      { natural: 'water', water: 'river' },
      { waterway: 'riverbank' },
      { waterway: 'river' },
      { natural: 'water' },
      { natural: 'bay' },
    ]
    for (const tags of notSea) expect(categorize(tags)).not.toContain('sea')
  })
})
