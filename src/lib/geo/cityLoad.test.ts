import { describe, expect, it } from 'vitest'
import {
  bboxPolygon,
  citySlug,
  formatBbox,
  growBbox,
  isPbfUrl,
  keepOneCentre,
  parseBbox,
  parseLatLon,
  parseNominatimCity,
  requiredFreeBytes,
} from './cityLoad'
import type { OsmPlaceRow } from './overpass'

const town = (id: number, lat: number, lon: number, extra: OsmPlaceRow['categories'] = []): OsmPlaceRow => ({
  osm_type: 'node',
  osm_id: id,
  name: `town ${id}`,
  categories: ['centre', ...extra],
  tags: { place: 'town', name: `town ${id}` },
  lat,
  lon,
  geom: `SRID=4326;POINT(${lon} ${lat})`,
})

// assistant-geo, Requirement: Загрузка мест города
describe('the parameters of a city load', () => {
  it('reads a rectangle and a centre', () => {
    expect(parseBbox('39.27,-0.53,39.58,-0.27')).toEqual({ south: 39.27, west: -0.53, north: 39.58, east: -0.27 })
    expect(parseBbox(' 39.27, -0.53 ,39.58,-0.27 ')).toEqual(parseBbox('39.27,-0.53,39.58,-0.27'))
    expect(parseLatLon('39.4697,-0.3763')).toEqual({ lat: 39.4697, lon: -0.3763 })
    expect(formatBbox(parseBbox('39.27,-0.53,39.58,-0.27'))).toBe('39.27,-0.53,39.58,-0.27')
  })

  it('refuses wrong ones with the reason', () => {
    expect(() => parseBbox('39.27,-0.53,39.58')).toThrow('south,west,north,east')
    expect(() => parseBbox('39.58,-0.53,39.27,-0.27')).toThrow('south < north')
    expect(() => parseBbox('39,-200,40,-0.2')).toThrow('outside')
    expect(() => parseBbox('a,b,c,d')).toThrow('south,west,north,east')
    expect(() => parseLatLon('39.4')).toThrow('lat,lon')
    expect(() => parseLatLon('95,0')).toThrow('outside')
  })

  it('grows the rectangle by kilometres, less in degrees of longitude', () => {
    const grown = growBbox({ south: 39.4, west: -0.4, north: 39.5, east: -0.3 }, 3)
    expect(grown.south).toBeCloseTo(39.4 - 3 / 111.32, 4)
    expect(grown.north - 39.5).toBeCloseTo(3 / 111.32, 4)
    expect(-0.4 - grown.west).toBeGreaterThan(3 / 111.32)
  })

  it('writes the rectangle as a closed polygon', () => {
    expect(bboxPolygon({ south: 1, west: 2, north: 3, east: 4 })).toBe('SRID=4326;POLYGON((2 1,4 1,4 3,2 3,2 1))')
  })

  it('names the files of a city and checks the extract', () => {
    expect(citySlug('València')).toBe('valencia')
    expect(citySlug('San Sebastián / Donostia')).toBe('san-sebastian-donostia')
    expect(citySlug('Москва')).toBe('city')
    expect(isPbfUrl('https://download.geofabrik.de/europe/spain/valencia-latest.osm.pbf')).toBe(true)
    expect(isPbfUrl('http://download.geofabrik.de/x.osm.pbf')).toBe(false)
    expect(isPbfUrl('https://example.com/x.zip')).toBe(false)
    expect(requiredFreeBytes(141 * 1024 ** 2)).toBe(Math.ceil(141 * 1024 ** 2 * 4) + 500 * 1024 ** 2)
  })

  it('reads the city of a Nominatim answer, skipping what is not a place', () => {
    const answer = [
      { category: 'highway', type: 'road', lat: '1', lon: '1', boundingbox: ['0', '2', '0', '2'] },
      {
        category: 'boundary',
        type: 'administrative',
        name: 'València',
        lat: '39.4697065',
        lon: '-0.3763353',
        boundingbox: ['39.2784496', '39.5665470', '-0.4325512', '-0.2725205'],
      },
    ]
    expect(parseNominatimCity(answer)).toEqual({
      name: 'València',
      lat: 39.4697065,
      lon: -0.3763353,
      bbox: { south: 39.2784496, west: -0.4325512, north: 39.566547, east: -0.2725205 },
    })
    expect(parseNominatimCity([])).toBeUndefined()
    expect(parseNominatimCity({ error: 'x' })).toBeUndefined()
  })

  it('keeps the centre on the town nearest to the city centre only', () => {
    const rows = [town(1, 39.47, -0.376), town(2, 39.51, -0.42), town(3, 39.6, -0.3, ['museum'])]
    const kept = keepOneCentre(rows, { lat: 39.4697, lon: -0.3763 })
    expect(kept.map((r) => [r.osm_id, r.categories])).toEqual([
      [1, ['centre']],
      [3, ['museum']],
    ])
    expect(keepOneCentre(rows, undefined)).toHaveLength(3)
  })
})
