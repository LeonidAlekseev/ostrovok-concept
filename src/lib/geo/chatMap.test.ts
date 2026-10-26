import { describe, expect, it } from 'vitest'
import { distanceText, durationText, parseChatMap, placeNumbers, thinLine, type ChatMap } from './chatMap'

const map: ChatMap = {
  points: [
    { kind: 'hotel', label: 'Hotel Turia', lat: 39.451, lon: -0.3582 },
    { kind: 'place', label: 'Farmacia El Saler', category: 'аптека', distanceM: 145, lat: 39.4522, lon: -0.3586 },
    {
      kind: 'place',
      label: 'Валенсия',
      category: 'аэропорт',
      distanceM: 10_900,
      lat: 39.49,
      lon: -0.48,
      source: 'ostrovok',
    },
  ],
  routes: [
    {
      mode: 'foot',
      distanceM: 177,
      durationS: 142,
      coordinates: [
        [-0.3582, 39.451],
        [-0.3586, 39.4522],
      ],
      to: 'Farmacia El Saler',
    },
  ],
  attribution: '© OpenStreetMap',
}

// assistant-geo, Requirement: Карта в ответе Эвала
describe('the map of a message', () => {
  it('is read back as it was kept', () => {
    expect(parseChatMap(JSON.parse(JSON.stringify(map)))).toEqual(map)
  })

  it('drops what is not a map: bad points and routes, a map with no place', () => {
    expect(parseChatMap(null)).toBeUndefined()
    expect(parseChatMap({ points: [map.points[0]], routes: [] })).toBeUndefined()
    const parsed = parseChatMap({
      points: [
        ...map.points,
        { kind: 'place', label: 'Nowhere', lat: 200, lon: 0 },
        { kind: 'shop', label: 'x', lat: 1, lon: 1 },
      ],
      routes: [...map.routes, { mode: 'boat', distanceM: 1, durationS: 1, coordinates: [], to: 'x' }],
      attribution: 'someone else',
    })
    expect(parsed).toEqual(map)
  })

  it('keeps a long route short: at most 200 points of 5 decimals, the ends kept', () => {
    const line = Array.from({ length: 1001 }, (_, i): [number, number] => [-0.3 - i * 1e-6 - 1.23e-7, 39.4 + i * 1e-6])
    const thin = thinLine(line)
    expect(thin.length).toBeLessThanOrEqual(200)
    expect(thin[0]).toEqual([-0.3, 39.4])
    expect(thin.at(-1)).toEqual([-0.301, 39.401])
  })

  it('numbers the places from 1, not the hotel', () => {
    expect(placeNumbers(map)).toEqual([0, 1, 2])
  })

  it('says distances and times in Russian', () => {
    expect(distanceText(144)).toBe('140 м')
    expect(distanceText(4)).toBe('10 м')
    expect(distanceText(12_345)).toBe('12,3 км')
    expect(durationText(20)).toBe('1 мин')
    expect(durationText(1063)).toBe('18 мин')
    expect(durationText(3900)).toBe('1 ч 5 мин')
  })
})
