import { describe, expect, it } from 'vitest'
import type { NearbyPlace } from '@/lib/hotelDetails'
import { linesOf, nearOf, ostrovokLandmarks, viewLandmarks, viewMapOf } from './view'

// hotel-page, Requirement: Вид из отеля настоящего отеля
describe('linesOf', () => {
  it('reads the lines of hotel_view_lines by their index, a line it cannot read as none', () => {
    const lines = linesOf(
      {
        own_building: 'own',
        lines: [
          {
            i: 1,
            distance_m: 4423,
            checked: true,
            crossed: 124,
            max_angle: 2.377,
            max_angle_upper: 3.635,
            first_above_m: 276.9,
            covered_m: 4423,
            blocker: { id: 'b6', distance_m: 276.9, height: 45, height_source: 'estimated', angle: 2.377 },
            target_building: null,
          },
          {
            i: 0,
            distance_m: 7000,
            checked: false,
            crossed: 0,
            max_angle: null,
            max_angle_upper: null,
            first_above_m: null,
            covered_m: null,
            blocker: null,
            target_building: { id: 't', height: 20, height_source: 'gov-spain' },
          },
          { i: 2, distance_m: 'far' },
          { i: 9, distance_m: 1 },
        ],
      },
      3,
    )
    expect(lines[1]).toEqual({
      distanceM: 4423,
      checked: true,
      crossed: 124,
      maxAngle: 2.377,
      maxAngleUpper: 3.635,
      firstAboveM: 276.9,
      coveredM: 4423,
      blocker: { id: 'b6', distanceM: 276.9, heightM: 45, estimated: true },
      targetBuilding: null,
    })
    expect(lines[0]).toMatchObject({ checked: false, targetBuilding: { id: 't', heightM: 20, estimated: false } })
    expect(lines[2]).toBeNull()
    expect(linesOf(null, 2)).toEqual([null, null])
  })
})

describe('nearOf', () => {
  it('keeps the places of the category and whether the cache covers it', () => {
    const answer = {
      covered: ['sea'],
      places: [
        { category: 'sea', name: null, lat: 39.4, lon: -0.3, near_lat: 39.46, near_lon: -0.331, distance_m: 4430 },
        {
          category: 'beach',
          name: 'Malvarrosa',
          lat: 39.4,
          lon: -0.3,
          near_lat: 39.4,
          near_lon: -0.3,
          distance_m: 5000,
        },
        { category: 'sea', name: 'broken' },
      ],
    }
    expect(nearOf(answer, 'sea')).toEqual({ covered: true, places: [answer.places[0]] })
    expect(nearOf(answer, 'attraction')).toEqual({ covered: false, places: [] })
    expect(nearOf('nope', 'sea')).toEqual({ covered: false, places: [] })
  })
})

describe('ostrovokLandmarks', () => {
  const place = (over: Partial<NearbyPlace>): NearbyPlace => ({
    id: 1,
    name: 'Музей',
    kind: 'Музей',
    distanceM: 500,
    bearingDeg: 90,
    lat: 39.47,
    lon: -0.37,
    transport: false,
    ...over,
  })

  it('checks the places but the stations, the airports and the far ones', () => {
    expect(
      ostrovokLandmarks([
        place({ name: 'Ла-Лонха' }),
        place({ name: 'Колон', kind: 'Станция', transport: true }),
        place({ name: 'Валенсия', kind: 'Аэропорт', distanceM: 8000 }),
        place({ name: 'Далеко', distanceM: 3500 }),
      ]),
    ).toEqual([{ name: 'Ла-Лонха', kind: 'Музей', lat: 39.47, lon: -0.37 }])
  })
})

// assistant-geo, Requirement: Одно место Островка и OpenStreetMap
describe('viewLandmarks', () => {
  const osm = (name: string, lat: number, lon: number, tags?: Record<string, string>) => ({
    category: 'attraction',
    name,
    lat,
    lon,
    near_lat: lat,
    near_lon: lon,
    distance_m: 0,
    ...(tags && { tags }),
  })

  it('names the Silk Exchange once, as Ostrovok does, and keeps the attractions Ostrovok has not', () => {
    const landmarks = viewLandmarks(
      [
        { name: 'Ла-Лонья', nameEn: 'La Lonja', kind: 'Достопримечательность', lat: 39.4741249, lon: -0.378566 },
        {
          name: 'Лонха-де-ла-Седа',
          nameEn: 'La Lonja de la Seda de Valencia',
          kind: 'Достопримечательность',
          lat: 39.4745026,
          lon: -0.378185,
        },
      ],
      [
        osm('Llotja de la Seda', 39.4744082, -0.3784312, { 'name:es': 'Lonja de la Seda' }),
        osm('Llotja de la Seda', 39.4744, -0.3784),
        osm('La casa dels gats', 39.4789, -0.3797),
      ],
    )
    expect(landmarks.map((l) => [l.kind, l.name, l.category])).toEqual([
      ['ostrovok', 'Ла-Лонья', 'достопримечательность'],
      ['attraction', 'La casa dels gats', 'достопримечательность'],
    ])
  })
})

describe('viewMapOf', () => {
  it('keeps the buildings with their heights, rounded to 5 decimals, and drops the noise', () => {
    expect(
      viewMapOf([
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[-0.3799123, 39.4735456]]] },
          properties: { layer: 'building', id: 'b1', height: 36, height_source: 'estimated', floors: 12 },
        },
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [] },
          properties: { layer: 'noise', source: 'roadsInAgglomeration' },
        },
      ]),
    ).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[-0.37991, 39.47355]]] },
          properties: { id: 'b1', height: 36, estimated: true },
        },
      ],
    })
  })
})
