import { describe, expect, it } from 'vitest'
import { apiDocument } from '@/lib/openapi/document'
import assistantGeo from '@/lib/openapi/examples/assistant-geo.json'
import assistantWish from '@/lib/openapi/examples/assistant-wish.json'
import hotelsBbox from '@/lib/openapi/examples/hotels-bbox.json'
import noiseMap from '@/lib/openapi/examples/noise-map.json'
import view from '@/lib/openapi/examples/view.json'
import viewMap from '@/lib/openapi/examples/view-map.json'
import { boundsOf, geoExamples, geoOfResponse, hotelRoute, HOTEL_COLOR } from './geo'

const hotel = { lat: 39.3833, lon: -0.33254 }
const kinds = (answer: ReturnType<typeof geoOfResponse>) => answer?.features.map((f) => f.properties.kind)

describe('geoOfResponse', () => {
  it('draws the hotels as points', () => {
    const answer = geoOfResponse('/api/hotels', hotelsBbox.response)
    expect(answer?.title).toBe('Отели: 3')
    expect(answer?.features[0]).toMatchObject({
      geometry: { type: 'Point', coordinates: [-0.33254, 39.3833] },
      properties: { kind: 'hotel', label: 'You & Co. Saler Beach Boutique Hotel' },
    })
  })

  it('draws the view: a line a ray and a target, the targets, the hotel', () => {
    const answer = geoOfResponse('/api/hotels/ota-9096882/view', view, hotel)!
    const targets = view.view.sea.length + view.view.landmarks.length
    expect(kinds(answer)?.filter((k) => k === 'line')).toHaveLength(view.view.rays.length + targets)
    expect(kinds(answer)?.filter((k) => k === 'place')).toHaveLength(targets)
    expect(answer.features.at(-1)).toMatchObject({ geometry: { coordinates: [hotel.lon, hotel.lat] } })
    expect(answer.sources).toEqual(['eubucco'])
  })

  it('finds the hotel of the view by its targets when it is not given', () => {
    const answer = geoOfResponse('/api/hotels/ota-9096882/view', view)!
    const [lon, lat] = answer.features.at(-1)!.geometry.coordinates as [number, number]
    expect(lon).toBeCloseTo(hotel.lon, 3)
    expect(lat).toBeCloseTo(hotel.lat, 3)
  })

  it('draws the buildings and the noise as shapes with their credits', () => {
    const buildings = geoOfResponse('/api/hotels/ota-9096882/view-map', viewMap, hotel)!
    expect(kinds(buildings)?.filter((k) => k === 'building')).toHaveLength(viewMap.map.features.length)
    expect(buildings.features[0].properties.label).toBe(`${viewMap.map.features[0].properties.height} м`)
    const noise = geoOfResponse('/api/hotels/ota-9096882/noise-map', noiseMap, hotel)!
    expect(noise.sources).toEqual(['eea'])
    expect(kinds(noise)).toEqual([...noiseMap.map.features.map(() => 'noise'), 'hotel'])
  })

  it("draws Эвал's map: the route, the hotel and the places", () => {
    const answer = geoOfResponse('/api/assistant', assistantGeo.response)!
    expect(kinds(answer)).toEqual(['route', 'hotel', 'place'])
    expect(answer.features[1].properties.color).toBe(HOTEL_COLOR)
  })

  it('has nothing to draw of an answer without geo', () => {
    expect(geoOfResponse('/api/assistant', assistantWish.response)).toBeNull()
    expect(geoOfResponse('/api/hotels/ota-9096882/view', { view: null })).toBeNull()
    expect(geoOfResponse('/api/hotels', { error: 'Catalog unavailable' })).toBeNull()
    expect(geoOfResponse('/api/revalidate', { revalidated: ['catalog'] })).toBeNull()
  })
})

describe('hotelRoute', () => {
  it('reads the hotel and the part of a hotel route', () => {
    expect(hotelRoute('/api/hotels/ota-9096882/noise-map')).toEqual({ hotelId: 'ota-9096882', part: 'noise-map' })
    expect(hotelRoute('/api/hotels')).toBeNull()
  })
})

describe('boundsOf', () => {
  it('spans every coordinate', () => {
    const answer = geoOfResponse('/api/assistant', assistantGeo.response)!
    const [west, south, east, north] = boundsOf(answer.features)!
    for (const [lon, lat] of assistantGeo.response.map.routes[0].coordinates) {
      expect(lon).toBeGreaterThanOrEqual(west)
      expect(lon).toBeLessThanOrEqual(east)
      expect(lat).toBeGreaterThanOrEqual(south)
      expect(lat).toBeLessThanOrEqual(north)
    }
  })
})

describe('geoExamples', () => {
  it('lists the examples of the geo routes the map can draw, with their paths filled', () => {
    const examples = geoExamples(apiDocument())
    expect(examples.map((e) => e.path)).toEqual([
      '/api/hotels',
      '/api/hotels',
      '/api/hotels',
      '/api/hotels/ota-9096882/view',
      '/api/hotels/ota-9096882/view-map',
      '/api/hotels/ota-9096882/noise-map',
      '/api/assistant',
    ])
    expect(examples.find((e) => e.path.endsWith('/noise-map'))?.title).toBe('Шум вокруг отеля · ota-9096882')
  })
})
