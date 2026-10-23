import { describe, expect, it } from 'vitest'
import { buildCatalog, hotelsIn } from './catalogGenerator'
import { destinations } from '../data/destinations'
import {
  aspectBetween,
  citySigns,
  cuspOf,
  daysInMonth,
  moonLongitude,
  moonPhase,
  moonSign,
  readStars,
  starPersona,
  starWish,
  sunSign,
  zodiac,
  type ReadingInput,
} from './horoscope'

const sign = (id: string) => zodiac.find((z) => z.id === id)!

// star-search, Requirement: Астрологический расчёт
describe('sunSign', () => {
  it.each([
    [3, 20, 'pisces'],
    [3, 21, 'aries'],
    [4, 19, 'aries'],
    [4, 20, 'taurus'],
    [6, 21, 'cancer'],
    [7, 22, 'cancer'],
    [7, 23, 'leo'],
    [12, 21, 'sagittarius'],
    [12, 22, 'capricorn'],
    [12, 31, 'capricorn'],
    [1, 1, 'capricorn'],
    [1, 19, 'capricorn'],
    [1, 20, 'aquarius'],
    [2, 18, 'aquarius'],
    [2, 19, 'pisces'],
    [2, 29, 'pisces'],
  ])('%i.%i is %s', (month, day, id) => {
    expect(sunSign(month, day).id).toBe(id)
  })

  it('marks the first and the last day of a sign as a cusp', () => {
    expect(cuspOf(3, 21)?.map((z) => z.id)).toEqual(['pisces', 'aries'])
    expect(cuspOf(3, 20)?.map((z) => z.id)).toEqual(['pisces', 'aries'])
    expect(cuspOf(1, 19)?.map((z) => z.id)).toEqual(['capricorn', 'aquarius'])
    expect(cuspOf(12, 22)?.map((z) => z.id)).toEqual(['sagittarius', 'capricorn'])
    expect(cuspOf(4, 1)).toBeNull()
  })

  it('knows the length of a month in a leap year', () => {
    expect(daysInMonth(2)).toBe(29)
    expect(daysInMonth(4)).toBe(30)
    expect(daysInMonth(12)).toBe(31)
  })
})

describe('moonPhase', () => {
  it('is the new moon on the reference new moon, 2000-01-06', () => {
    expect(moonPhase('2000-01-06').name).toBe('Новолуние')
  })

  // Full moons of 2026, UT: F. Espenak, "Phases of the Moon: 2001 to 2100",
  // https://www.astropixels.com/ephemeris/moon/phases2001gmt.html
  it.each([
    '2026-01-03',
    '2026-02-01',
    '2026-03-03',
    '2026-04-02',
    '2026-05-01',
    '2026-05-31',
    '2026-06-29',
    '2026-07-29',
    '2026-08-28',
    '2026-09-26',
    '2026-10-26',
    '2026-11-24',
    '2026-12-24',
  ])('is the full moon on %s', (date) => {
    expect(moonPhase(date)).toMatchObject({ name: 'Полнолуние', waxing: false })
  })

  // New moons and quarters of 2026 from the same table.
  it.each([
    ['2026-01-18', 'Новолуние'],
    ['2026-08-12', 'Новолуние'],
    ['2026-01-26', 'Первая четверть'],
    ['2026-10-18', 'Первая четверть'],
    ['2026-02-09', 'Последняя четверть'],
    ['2026-11-01', 'Последняя четверть'],
  ])('%s is %s', (date, name) => {
    expect(moonPhase(date).name).toBe(name)
  })
})

describe('moonLongitude', () => {
  // J. Meeus, "Astronomical Algorithms", 2nd ed., example 47.a: on 1992-04-12 at 0h TD the Moon is at
  // 133.163°, in Leo.
  it('is within 2° of the ephemeris', () => {
    expect(Math.abs(moonLongitude(Date.UTC(1992, 3, 12)) - 133.163)).toBeLessThan(2)
    expect(moonSign('1992-04-12').id).toBe('leo')
  })
})

describe('aspectBetween', () => {
  it.each([
    ['aries', 'aries', 'conjunction'],
    ['aries', 'gemini', 'sextile'],
    ['aries', 'cancer', 'square'],
    ['aries', 'leo', 'trine'],
    ['aries', 'libra', 'opposition'],
    ['pisces', 'taurus', 'sextile'],
    ['capricorn', 'taurus', 'trine'],
    ['aries', 'taurus', null],
    ['aries', 'virgo', null],
  ])('%s and %s: %s', (a, b, aspect) => {
    expect(aspectBetween(sign(a), sign(b))).toBe(aspect)
  })
})

describe('readStars', () => {
  const input: ReadingInput = { name: 'Анна', birthMonth: 3, birthDay: 21, checkIn: '2026-10-26', company: 'solo' }
  const catalogue = buildCatalog()

  it('gives every catalogue city a sign', () => {
    for (const city of destinations) expect(zodiac.map((z) => z.id)).toContain(citySigns[city.id])
  })

  it('is deterministic', () => {
    expect(readStars(input, destinations, catalogue)).toEqual(readStars(input, destinations, catalogue))
  })

  it('reads the sign, the transit and the Moon of the check-in day', () => {
    const reading = readStars(input, destinations, catalogue)
    expect(reading.sign.id).toBe('aries')
    expect(reading.sunTransit.id).toBe('scorpio')
    expect(reading.moon.phase.name).toBe('Полнолуние')
    expect(reading.forecast).toContain('Анна')
    expect(reading.forecast).toContain(reading.city.name)
    expect(reading.forecast).not.toContain('{city}')
  })

  it('picks the best hotel of the best city and the best of two other cities', () => {
    const { hotels, city } = readStars(input, destinations, catalogue)
    expect(hotels).toHaveLength(3)
    expect(hotels[0].destinationId).toBe(city.id)
    expect(new Set(hotels.map((h) => h.destinationId)).size).toBe(3)
    for (const hotel of hotels)
      expect(hotel.rating).toBe(Math.max(...hotelsIn(hotel.destinationId).map((h) => h.rating)))
  })

  it('lets a companion sign change the score', () => {
    const results = new Set(
      zodiac.map((z) => readStars({ ...input, company: 'pair', partnerSignId: z.id }, destinations, catalogue).city.id),
    )
    expect(results.size).toBeGreaterThan(1)
  })
})

// routes, Requirement: Лучший готовый маршрут
describe('starPersona', () => {
  const sign = (element: string) => zodiac.find((z) => z.element === element)!

  it('reads the company, then the element alone', () => {
    expect(starPersona(sign('fire'), 'pair')).toBe('luxury')
    expect(starPersona(sign('water'), 'group')).toBe('student')
    expect(starPersona(sign('earth'), 'solo')).toBe('workation')
    expect(starPersona(sign('air'), 'solo')).toBe('workation')
    expect(starPersona(sign('fire'), 'solo')).toBe('culture')
  })

  it('words the reading for the search without the name', () => {
    const city = destinations.find((d) => d.id === 'prague')!
    expect(starWish({ sign: sign('fire'), city }, 'pair')).toMatch(/^Поездка вдвоём: Прага, Чехия\. Огненным/)
  })
})
