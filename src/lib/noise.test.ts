import { describe, expect, it } from 'vitest'
import {
  dayColorLevel,
  dayEstimate,
  dayLabel,
  dayLevel,
  energySum,
  facadeOf,
  isHotelGeoQuestion,
  isNoiseQuestion,
  ldenOf,
  loudestSource,
  noiseEstimate,
  venueLevel,
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
  yard: [
    { source: 'industryInAgglomeration', lden: { max: 39 }, lnight: { max: 39 } },
    { source: 'roadsInAgglomeration', lden: { max: 39 }, lnight: { max: 39 } },
  ],
  zone: { kind: 'building', buildingId: 'b-1', bufferM: 5 },
  places: [
    { category: 'bar', name: 'Homenaje', distanceM: 91.9, lat: 39.47, lon: -0.376 },
    { category: 'tram', name: null, distanceM: 120, lat: 39.47, lon: -0.377 },
    { category: 'bar', name: 'Sereno', distanceM: 150, lat: 39.47, lon: -0.378 },
  ],
  placesCovered: ['nightclub', 'bar', 'restaurant', 'cafe', 'fast_food', 'tram', 'train_station'],
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

  it('keeps the day no quieter than the night when the quiet end does not fit', () => {
    const day = dayEstimate({ min: 65, max: 69 }, { min: 60, max: 64 })!
    expect(day.min).toBe(60)
    expect(day.max).toBeCloseTo(dayLevel(70, 60)!, 6)
    // Lden 65 with the day as loud as the night: 58.6 dB, above the night band's 55.
    const even = dayEstimate({ min: 65, max: 69 }, { min: 55, max: 59 })!
    expect(lden(even.min, even.min, even.min)).toBeCloseTo(65, 6)
    expect(dayLabel(even)).toBe('59–69 дБ')
  })

  it('opens at the top with an Lden open at the top', () => {
    const day = dayEstimate({ min: 75 }, { min: 65, max: 69 })!
    expect(day.max).toBe(Infinity)
    expect(lden(day.min, day.min, day.min)).toBeCloseTo(75, 6)
    expect(dayLabel(day)).toBe('от 69 дБ')
    expect(dayColorLevel(day)).toBe(day.min)
  })

  it('takes a night band open below as a night unbounded below', () => {
    const day = dayEstimate({ min: 40, max: 44 }, { max: 39 })!
    expect(day.max).toBeCloseTo(dayLevel(45, -Infinity)!, 6)
    expect(lden(day.min, day.min, day.min)).toBeCloseTo(40, 6)
    expect(dayColorLevel(day)).toBeCloseTo((day.min + day.max) / 2, 6)
  })

  it('is below 40 dB with an Lden below 40 dB: the day is quieter than the Lden', () => {
    const day = dayEstimate({ max: 39 }, { max: 39 })!
    expect(day.min).toBe(-Infinity)
    expect(day.max).toBeLessThan(40)
    expect(dayLabel(day)).toBe('ниже 40 дБ')
    expect(dayColorLevel(day)).toBe(day.max)
  })

  it('has none without both bands or for bands that fit no day', () => {
    expect(dayEstimate(undefined, { min: 50, max: 54 })).toBeNull()
    expect(dayEstimate({ min: 60, max: 64 }, undefined)).toBeNull()
    // A night of 55 dB alone makes an Lden of 60.2 dB.
    expect(dayEstimate({ min: 55, max: 59 }, { min: 55, max: 59 })).toBeNull()
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

describe('the questions', () => {
  it('tell the noise from the places near', () => {
    for (const text of ['Тут шумно ночью?', 'Тихо ли рядом с отелем?', 'Громко ли вокруг?', 'Сколько децибел?'])
      expect([isNoiseQuestion(text), isHotelGeoQuestion(text)]).toEqual([true, false])
    for (const text of ['Есть ли рядом бар?', 'Сколько идти до аптеки?', 'Где ночные клубы?'])
      expect([isNoiseQuestion(text), isHotelGeoQuestion(text)]).toEqual([false, true])
    expect(isNoiseQuestion('Покажи стихи')).toBe(false)
    expect(isHotelGeoQuestion('Есть ли парковка?')).toBe(false)
  })
})

describe('noiseLines', () => {
  it('state the estimate at the facade to the street and to the yard, the places, the layers and the places nearby', () => {
    const lines = noiseLines(roads)
    expect(lines[0]).toMatch(
      /^Оценка шума у фасада на улицу \(noise-estimate-v2: карты шума EEA 2022 и шумные места OpenStreetMap\): днём 59–69 дБ, вечером 59–69 дБ, ночью 55–60 дБ, за сутки \(Lden\) 65–70 дБ\.$/,
    )
    expect(lines[1]).toMatch(
      /^Окна во двор \(самые тихие полосы EEA у здания, без заведений: здание их экранирует\): днём /,
    )
    expect(lines[2]).toBe('Вклад заведений рядом (2 места в 200 м): днём ≈40 дБ, вечером ≈47 дБ, ночью ≈44 дБ.')
    expect(lines[3]).toBe(
      'Карты шума EEA у фасада на улицу: Промышленность ниже 40 дБ за сутки ниже 40 дБ ночью; Дороги города 65–69 дБ за сутки 55–59 дБ ночью; ночью выше рекомендации ВОЗ (45 дБ ночью).',
    )
    expect(lines[4]).toBe(
      'Шумные места OpenStreetMap в 200 м: 2 бара, ближайшее место «Homenaje» — 90 м; 1 остановка трамвая, ближайшее место — 120 м.',
    )
  })

  it('say there is no EEA data, never that it is quiet', () => {
    const lines = noiseLines({ sources: [], yard: [], zone: null, places: [], placesCovered: [] })
    expect(lines).toEqual([expect.stringMatching(/^Нет данных EEA/)])
    expect(lines.join(' ')).not.toMatch(/тих/i)
  })

  it('tell no loud places only when OSM covers every category', () => {
    expect(noiseLines({ ...roads, places: [] }).at(-1)).toMatch(/^Баров, клубов, ресторанов, кафе.*нет\.$/)
    expect(placeLines({ places: [] })).toEqual([])
  })

  it('are none without the data', () => {
    expect(noiseLines(null)).toEqual([])
  })
})

// hotel-knowledge, Requirement: Оценка шума у фасада
describe('noise-estimate-v2', () => {
  it('lets a place fall by 20·lg(d/10) from its level at 10 m, no closer than 3 m', () => {
    expect(venueLevel(60, 10)).toBe(60)
    expect(venueLevel(60, 100)).toBeCloseTo(40, 6)
    expect(venueLevel(62, 1)).toBeCloseTo(venueLevel(62, 3), 6)
    expect(venueLevel(62, 3)).toBeCloseTo(62 + 10.46, 2)
  })

  it('sums by energy, an open end open', () => {
    expect(energySum([60, 60])).toBeCloseTo(63.01, 2)
    expect(energySum([70, -Infinity])).toBe(70)
    expect(energySum([-Infinity])).toBe(-Infinity)
    expect(energySum([])).toBe(-Infinity)
    expect(energySum([50, Infinity])).toBe(Infinity)
    expect(ldenOf(60, 60, 50)).toBeCloseTo(lden(60, 60, 50), 6)
    expect(ldenOf(60, -Infinity, -Infinity)).toBeCloseTo(10 * Math.log10(0.5 * 10 ** 6), 6)
  })

  // The hotel ota-9741622 of Valencia, BirdHouse: the street at its door is 70–74 dB, its point only in industry.
  const birdhouse: HotelNoise = {
    sources: [
      { source: 'roadsInAgglomeration', lden: { min: 70, max: 74 }, lnight: { min: 65, max: 69 } },
      { source: 'industryInAgglomeration', lden: { max: 39 }, lnight: { max: 39 } },
      { source: 'railwaysInAgglomeration', lden: { max: 39 }, lnight: { max: 39 } },
    ],
    yard: [
      { source: 'industryInAgglomeration', lden: { max: 39 }, lnight: { max: 39 } },
      { source: 'railwaysInAgglomeration', lden: { max: 39 }, lnight: { max: 39 } },
      { source: 'roadsInAgglomeration', lden: { max: 39 }, lnight: { max: 39 } },
    ],
    zone: { kind: 'building', buildingId: '21adf97303954791-16', bufferM: 5 },
    places: [
      { category: 'cafe', name: 'Cerveceria Tamesis', distanceM: 47.6, lat: 0, lon: 0 },
      { category: 'restaurant', name: 'Pasión turca', distanceM: 52.7, lat: 0, lon: 0 },
      { category: 'cafe', name: 'Cervecería Taxi-Driver', distanceM: 75.2, lat: 0, lon: 0 },
      { category: 'bar', name: 'cerveceria tames', distanceM: 85.5, lat: 0, lon: 0 },
      { category: 'tram', name: null, distanceM: 90, lat: 0, lon: 0 },
    ],
    placesCovered: [],
  }

  it('reads the street at the facade, not the industry at the point', () => {
    const estimate = noiseEstimate(birdhouse)!
    expect(estimate.eea.street.lden).toEqual({ min: 70, max: expect.closeTo(75, 1) })
    expect(estimate.eea.street.lnight!.min).toBe(65)
    expect(estimate.eea.street.lnight!.max).toBeCloseTo(70, 1)
    expect(estimate.street.lday!.min).toBeGreaterThan(65)
    expect(estimate.street.lday!.max).toBeCloseTo(73.15, 1)
    expect(dayLabel(estimate.street.lnight!)).toBe('65–70 дБ')
    // The tram stop is no venue; the bar is the only one open at night: 62 − 20·lg(8.55).
    expect(estimate.counted.map((v) => v.category)).toEqual(['cafe', 'restaurant', 'cafe', 'bar'])
    expect(estimate.venues.lnight).toBeCloseTo(venueLevel(62, 85.5), 6)
    expect(estimate.venues.lday).toBeCloseTo(
      energySum([venueLevel(60, 47.6), venueLevel(60, 52.7), venueLevel(60, 75.2), venueLevel(58, 85.5)]),
      6,
    )
    // The yard: the quietest bands below 40 dB alone — the building screens the places from it.
    expect(estimate.yard.lnight).toEqual(estimate.eea.yard.lnight)
    expect(estimate.yard.lnight!.min).toBe(-Infinity)
    expect(estimate.yard.lnight!.max).toBeCloseTo(energySum([40, 40, 40]), 6)
  })

  it('keeps an open band open at the top', () => {
    const estimate = noiseEstimate({
      ...birdhouse,
      sources: [{ source: 'roadsInAgglomeration', lden: { min: 75 }, lnight: { min: 70 } }],
    })!
    expect(estimate.street.lnight!.max).toBe(Infinity)
    expect(dayLabel(estimate.street.lnight!)).toBe('от 70 дБ')
    expect(estimate.street.lday!.max).toBe(Infinity)
  })

  it('makes no estimate without an EEA band at the facade, and leaves out a layer without a day', () => {
    expect(noiseEstimate({ ...birdhouse, sources: [], yard: [] })).toBeNull()
    const airport = noiseEstimate({
      ...birdhouse,
      sources: [{ source: 'majorAirportsIncludingAgglomeration', lden: { min: 55, max: 59 } }],
      places: [],
    })!
    expect(airport.noDay).toEqual(['majorAirportsIncludingAgglomeration'])
    expect(airport.street.lday).toBeNull()
    expect(airport.venues).toEqual({ lday: null, levening: null, lnight: null, lden: null })
  })

  it('reads the answer of hotel_noise_facade, the louder layer first', () => {
    const facade = facadeOf({
      zone: { kind: 'building', building_id: 'b-1', buffer_m: 5 },
      bands: [
        { side: 'street', source: 'industryInAgglomeration', indicator: 'Lden', db_min: null, db_max: 39 },
        { side: 'street', source: 'roadsInAgglomeration', indicator: 'Lden', db_min: 70, db_max: 74 },
        { side: 'street', source: 'roadsInAgglomeration', indicator: 'Lnight', db_min: 65, db_max: 69 },
        { side: 'yard', source: 'roadsInAgglomeration', indicator: 'Lnight', db_min: null, db_max: 39 },
        { side: 'street', source: 'bad source', indicator: 'Lden', db_min: 50, db_max: 54 },
        { side: 'roof', source: 'roadsInAgglomeration', indicator: 'Lden', db_min: 50, db_max: 54 },
      ],
    })
    expect(facade).toEqual({
      sources: [
        { source: 'roadsInAgglomeration', lden: { min: 70, max: 74 }, lnight: { min: 65, max: 69 } },
        { source: 'industryInAgglomeration', lden: { max: 39 } },
      ],
      yard: [{ source: 'roadsInAgglomeration', lnight: { max: 39 } }],
      zone: { kind: 'building', buildingId: 'b-1', bufferM: 5 },
    })
    expect(facadeOf({ zone: { kind: 'circle', radius_m: 25 }, bands: [] }).zone).toEqual({
      kind: 'circle',
      radiusM: 25,
    })
    expect(facadeOf(null)).toEqual({ sources: [], yard: [], zone: null })
  })
})
