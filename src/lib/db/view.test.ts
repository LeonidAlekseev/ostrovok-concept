import { describe, expect, it } from 'vitest'
import type { NearbyPlace } from '@/lib/hotelDetails'
import { linesOf, nearOf, ownBuildingOf, ostrovokLandmarks, viewLandmarks, viewMapOf } from './view'

// hotel-page, Requirement: Вид из отеля настоящего отеля
describe('linesOf', () => {
  it('reads the lines of hotel_view_eyes by their index, a line it cannot read as none', () => {
    const answer = {
      own_building: 'own',
      lines: [
        {
          i: 1,
          distance_m: 4423,
          checked: true,
          crossed: 124,
          covered_m: 4423,
          eyes: [
            {
              eye_m: 49.81,
              eye_lower_m: 40.5,
              eye_upper_m: 59.13,
              blockers: [
                {
                  id: 'b6',
                  distance_m: 276.9,
                  height: 45,
                  height_lower: 36.4,
                  height_upper: 59.2,
                  height_source: 'estimated',
                  eye_m: 44.9,
                  eye_lower_m: 36.3,
                  eye_upper_m: 59.13,
                },
              ],
            },
          ],
          target_building: null,
        },
        {
          i: 0,
          distance_m: 7000,
          checked: false,
          crossed: 0,
          covered_m: null,
          eyes: [],
          target_building: { id: 't', height: 20, height_source: 'gov-spain' },
        },
        { i: 2, distance_m: 'far' },
        { i: 9, distance_m: 1 },
      ],
    }
    const lines = linesOf(answer, 3)
    expect(lines[1]).toEqual({
      distanceM: 4423,
      checked: true,
      crossed: 124,
      coveredM: 4423,
      eyes: [
        {
          eyeM: 49.81,
          eyeLowerM: 40.5,
          eyeUpperM: 59.13,
          blockers: [
            {
              id: 'b6',
              distanceM: 276.9,
              heightM: 45,
              heightLowerM: 36.4,
              heightUpperM: 59.2,
              estimated: true,
              eyeLowerM: 36.3,
              eyeM: 44.9,
              eyeUpperM: 59.13,
            },
          ],
        },
      ],
      targetBuilding: null,
    })
    expect(lines[0]).toMatchObject({ checked: false, targetBuilding: { id: 't', heightM: 20, estimated: false } })
    expect(lines[2]).toBeNull()
    expect(linesOf(null, 2)).toEqual([null, null])
    expect(ownBuildingOf(answer)).toBe('own')
    expect(ownBuildingOf(null)).toBeNull()
  })

  it('reads an answer of before the bounds as the height alone', () => {
    const [line] = linesOf(
      {
        own_building: null,
        lines: [
          {
            i: 0,
            distance_m: 100,
            checked: true,
            crossed: 1,
            covered_m: 100,
            eyes: [
              {
                eye_m: 10,
                eye_upper_m: 12,
                blockers: [{ id: 'b', distance_m: 50, height: 20, height_source: 'osm', eye_m: 10, eye_upper_m: 12 }],
              },
            ],
            target_building: null,
          },
        ],
      },
      1,
    )
    expect(line?.eyes[0]).toMatchObject({ eyeM: 10, eyeLowerM: 10, eyeUpperM: 12 })
    expect(line?.eyes[0].blockers[0]).toMatchObject({ heightLowerM: 20, heightUpperM: 20, eyeLowerM: 10 })
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
