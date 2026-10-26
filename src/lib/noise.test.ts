import { describe, expect, it } from 'vitest'
import {
  dayCurve,
  dayEstimate,
  dayLabel,
  dayLevel,
  levelAt,
  loudestSource,
  noiseColor,
  noiseLines,
  placeLines,
  whoLine,
  whoVerdict,
  type HotelNoise,
} from './noise'

/** Lden of the directive from the three levels. */
const lden = (day: number, evening: number, night: number) =>
  10 * Math.log10((12 * 10 ** (day / 10) + 4 * 10 ** ((evening + 5) / 10) + 8 * 10 ** ((night + 10) / 10)) / 24)

const roads: HotelNoise = {
  sources: [
    { source: 'industryInAgglomeration', lden: { max: 39 }, lnight: { max: 39 } },
    { source: 'roadsInAgglomeration', lden: { min: 65, max: 69 }, lnight: { min: 55, max: 59 } },
  ],
  places: [
    { category: 'bar', name: 'Homenaje', distanceM: 91.9, lat: 39.47, lon: -0.376 },
    { category: 'tram', name: null, distanceM: 120, lat: 39.47, lon: -0.377 },
    { category: 'bar', name: 'Sereno', distanceM: 150, lat: 39.47, lon: -0.378 },
  ],
  placesCovered: ['nightclub', 'bar', 'restaurant', 'fast_food', 'tram', 'train_station'],
}

// hotel-page, Requirement: Шум и окружение настоящего отеля
describe('dayLevel', () => {
  it('inverts the Lden of the directive with the evening as loud as the day', () => {
    expect(dayLevel(lden(60, 60, 50), 50)).toBeCloseTo(60, 6)
    expect(dayLevel(lden(72.5, 72.5, 61), 61)).toBeCloseTo(72.5, 6)
  })

  it('has no day level when the night alone is louder than the Lden', () => {
    expect(dayLevel(60, 60)).toBeNull()
  })
})

describe('dayEstimate', () => {
  it('spans the day levels of the bands', () => {
    const day = dayEstimate({ min: 65, max: 69 }, { min: 45, max: 49 })!
    expect(day.min).toBeCloseTo(dayLevel(65, 50)!, 6)
    expect(day.max).toBeCloseTo(dayLevel(70, 45)!, 6)
    expect(dayLabel(day)).toBe('64–70 дБ')
  })

  it('keeps the night lower bound when the quiet end does not fit', () => {
    const day = dayEstimate({ min: 65, max: 69 }, { min: 60, max: 64 })!
    expect(day.min).toBe(60)
    expect(day.max).toBeCloseTo(dayLevel(70, 60)!, 6)
  })

  it('has none for an open band', () => {
    expect(dayEstimate({ min: 75 }, { min: 65, max: 69 })).toBeNull()
    expect(dayEstimate({ min: 40, max: 44 }, { max: 39 })).toBeNull()
    expect(dayEstimate(undefined, { min: 50, max: 54 })).toBeNull()
  })
})

describe('the day curve', () => {
  it('is the night at night, the day by day and smooth between', () => {
    expect(levelAt(3, 60, 50)).toBe(50)
    expect(levelAt(12, 60, 50)).toBe(60)
    expect(levelAt(20, 60, 50)).toBe(60)
    expect(levelAt(7, 60, 50)).toBeCloseTo(55, 6)
    expect(levelAt(23, 60, 50)).toBeCloseTo(55, 6)
    expect(levelAt(6.5, 60, 50)).toBeGreaterThan(50)
    expect(levelAt(6.5, 60, 50)).toBeLessThan(55)
  })

  it('draws the layer of the loudest Lden in half-hours', () => {
    const curve = dayCurve(roads)!
    expect(curve.levels).toHaveLength(48)
    expect(curve.night).toBe(57.5)
    expect(curve.levels[0]).toBe(57.5)
    expect(curve.day).toBeCloseTo(dayLevel(67.5, 57.5)!, 6)
    expect(curve.levels[24]).toBeCloseTo(curve.day, 6)
  })

  it('is not drawn for open bands', () => {
    expect(
      dayCurve({ sources: [{ source: 'roadsInAgglomeration', lden: { min: 75 }, lnight: { min: 65, max: 69 } }] }),
    ).toBeNull()
  })
})

describe('the bands', () => {
  it('pick the loudest layer', () => {
    expect(loudestSource(roads, 'Lden')?.source).toBe('roadsInAgglomeration')
    expect(
      loudestSource(
        {
          sources: [
            { source: 'a', lden: { min: 70, max: 74 } },
            { source: 'b', lden: { min: 75 } },
          ],
        },
        'Lden',
      )?.source,
    ).toBe('b')
  })

  it('stand to the WHO recommendation of their layer', () => {
    expect(whoVerdict(roads.sources[1], 'Lnight')).toBe('above')
    expect(whoVerdict({ source: 'roadsInAgglomeration', lnight: { min: 40, max: 44 } }, 'Lnight')).toBe('below')
    expect(whoVerdict({ source: 'roadsInAgglomeration', lden: { min: 50, max: 54 } }, 'Lden')).toBe('around')
    expect(whoVerdict(roads.sources[0], 'Lnight')).toBeNull()
    expect(whoLine(roads.sources[1], 'Lnight')).toBe('выше рекомендации ВОЗ (45 дБ ночью)')
  })

  it('colour green to red', () => {
    expect(noiseColor(35)).toBe('#1a9850')
    expect(noiseColor(57)).toBe('#fee08b')
    expect(noiseColor(80)).toBe('#a50026')
  })
})

describe('noiseLines', () => {
  it('state the bands, the day estimate, the layers and the places', () => {
    const lines = noiseLines(roads)
    expect(lines[0]).toBe(
      'За сутки (Lden) по карте шума EEA 2022: 65–69 дБ, громче всего — дороги города; выше рекомендации ВОЗ (53 дБ за сутки).',
    )
    expect(lines[1]).toMatch(/^Ночью \(Lnight, 23:00–07:00\): 55–59 дБ/)
    expect(lines[2]).toMatch(/директива ЕС 2002\/49\/EC.*55–69 дБ/)
    expect(lines[3]).toMatch(/^Источники EEA у отеля: Промышленность ниже 40 дБ за сутки/)
    expect(lines[4]).toBe(
      'Шумные места OpenStreetMap в 200 м: 2 бара, ближайшее место «Homenaje» — 90 м; 1 остановка трамвая, ближайшее место — 120 м.',
    )
  })

  it('say there is no EEA data, never that it is quiet', () => {
    const lines = noiseLines({ sources: [], places: [], placesCovered: [] })
    expect(lines).toEqual([expect.stringMatching(/^Нет данных EEA/)])
    expect(lines.join(' ')).not.toMatch(/тих/i)
  })

  it('tell no loud places only when OSM covers every category', () => {
    expect(noiseLines({ ...roads, places: [] }).at(-1)).toMatch(/^Баров, клубов.*нет\.$/)
    expect(placeLines({ places: [] })).toEqual([])
  })

  it('are none without the data', () => {
    expect(noiseLines(null)).toEqual([])
  })
})
