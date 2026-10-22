import { describe, expect, it } from 'vitest'
import { destinations } from '../data/destinations'
import {
  findScenario,
  fromSearchParams,
  parseGuestParams,
  parseStayParams,
  resolveTarget,
  suggestDestinations,
  toSearchParams,
  validateSearch,
  withStartDates,
  type SearchQuery,
} from './search'

const ids = (list: { id: string }[]) => list.map((d) => d.id)

describe('resolveTarget', () => {
  it('returns null for empty text', () => {
    expect(resolveTarget('   ', destinations)).toBeNull()
  })

  it('finds a destination by its exact name ignoring case, outer spaces and ё/е', () => {
    expect(resolveTarget('  пРАГА ', destinations)).toMatchObject({
      kind: 'destination',
      destination: { id: 'prague' },
    })
    expect(resolveTarget('Хёльсинки', destinations)).toMatchObject({
      kind: 'destination',
      destination: { id: 'helsinki' },
    })
  })

  it('finds a scenario by its exact title', () => {
    expect(resolveTarget('у моря', destinations)).toEqual({ kind: 'scenario', scenario: 'sea', title: 'У моря' })
  })

  it('does not resolve partial names or countries', () => {
    expect(resolveTarget('Праг', destinations)).toBeNull()
    expect(resolveTarget('Чехия', destinations)).toBeNull()
  })
})

describe('findScenario', () => {
  it('finds a scenario by title ignoring case, outer spaces and ё/е', () => {
    expect(findScenario('  нА вЫХОДНЫЕ ')).toMatchObject({ id: 'weekend' })
    expect(findScenario('Города Ёвропы')).toMatchObject({ id: 'europe' })
  })

  it('returns undefined for empty or unknown text', () => {
    expect(findScenario('   ')).toBeUndefined()
    expect(findScenario('В горы')).toBeUndefined()
  })
})

describe('suggestDestinations', () => {
  it('suggests globe destinations for empty input', () => {
    const expected = destinations.filter((d) => d.onGlobe).slice(0, 6)
    expect(suggestDestinations('  ', destinations)).toEqual(expected)
    expect(ids(suggestDestinations('', destinations))).toEqual([
      'prague',
      'london',
      'oslo',
      'helsinki',
      'rome',
      'madrid',
    ])
  })

  it('suggests the scenario destinations when the text is a scenario title', () => {
    const sea = destinations.filter((d) => d.scenarios.includes('sea')).slice(0, 6)
    expect(suggestDestinations('  У МОРЯ ', destinations)).toEqual(sea)
  })

  it('puts matches by name or country start before matches inside the text', () => {
    // "ис" starts "Испания" (Madrid, Barcelona) and "Исландия" (Reykjavik), and occurs inside the others.
    expect(ids(suggestDestinations('ис', destinations))).toEqual([
      'madrid',
      'barcelona',
      'reykjavik',
      'lisbon',
      'tbilisi',
    ])
  })

  it('matches by country', () => {
    expect(ids(suggestDestinations('сша', destinations))).toEqual(['new-york', 'miami', 'los-angeles', 'honolulu'])
  })

  it('limits the number of suggestions', () => {
    expect(suggestDestinations('а', destinations)).toHaveLength(6)
    expect(suggestDestinations('а', destinations, 2)).toHaveLength(2)
  })

  it('returns nothing when no destination matches', () => {
    expect(suggestDestinations('zzz', destinations)).toEqual([])
  })
})

describe('validateSearch', () => {
  const today = '2026-10-19'
  const valid: SearchQuery = {
    destination: 'Прага',
    checkIn: '2026-10-20',
    checkOut: '2026-10-21',
    guests: { adults: 2, children: 0, rooms: 1 },
  }
  const check = (patch: Partial<SearchQuery>) => validateSearch({ ...valid, ...patch }, today, destinations)

  it('accepts a valid query, including a scenario and check-in today', () => {
    expect(check({})).toEqual({})
    expect(check({ destination: 'У моря', checkIn: today })).toEqual({})
  })

  it('reports an empty destination', () => {
    expect(check({ destination: '  ' }).destination).toBe('Укажите, куда вы хотите поехать')
  })

  it('reports a destination that is not in the catalogue', () => {
    expect(check({ destination: 'Атлантида' }).destination).toBe('Выберите направление из списка подсказок')
  })

  it('reports check-in in the past before any other date error', () => {
    expect(check({ checkIn: '2026-10-18', checkOut: '2026-10-18' }).dates).toBe('Дата заезда уже прошла')
  })

  it('reports check-out that is not later than check-in', () => {
    expect(check({ checkOut: '2026-10-20' }).dates).toBe('Дата выезда должна быть позже даты заезда')
  })

  it('allows 30 nights and reports more than 30', () => {
    expect(check({ checkOut: '2026-11-19' }).dates).toBeUndefined()
    expect(check({ checkOut: '2026-11-20' }).dates).toBe('Максимальный срок проживания — 30 ночей')
  })

  it('reports more rooms than adults', () => {
    expect(check({ guests: { adults: 1, children: 0, rooms: 2 } }).guests).toBe(
      'В каждом номере должен быть хотя бы один взрослый',
    )
  })

  it('reports guest counts outside GUEST_LIMITS', () => {
    expect(check({ guests: { adults: 0, children: 0, rooms: 0 } }).guests).toBe('Проверьте количество гостей')
    expect(check({ guests: { adults: 2, children: -1, rooms: 1 } }).guests).toBe('Проверьте количество гостей')
  })

  it('checks the upper guest limits', () => {
    expect(check({ guests: { adults: 11, children: 0, rooms: 1 } }).guests).toBe('Проверьте количество гостей')
    expect(check({ guests: { adults: 2, children: 7, rooms: 1 } }).guests).toBe('Проверьте количество гостей')
    expect(check({ guests: { adults: 10, children: 0, rooms: 6 } }).guests).toBe('Проверьте количество гостей')
    expect(check({ guests: { adults: 10, children: 6, rooms: 5 } })).toEqual({})
  })

  it('reports several fields at once', () => {
    expect(
      Object.keys(check({ destination: '', checkOut: valid.checkIn, guests: { adults: 1, children: 0, rooms: 2 } })),
    ).toEqual(['destination', 'dates', 'guests'])
  })
})

describe('fromSearchParams', () => {
  const query: SearchQuery = {
    destination: 'Прага',
    checkIn: '2026-10-20',
    checkOut: '2026-10-23',
    guests: { adults: 3, children: 1, rooms: 2 },
  }

  it('reads back what toSearchParams wrote, for a city and a scenario', () => {
    expect(fromSearchParams(toSearchParams(query, resolveTarget('Прага', destinations)!), destinations)).toEqual(query)
    const sea = { ...query, destination: 'У моря' }
    expect(fromSearchParams(toSearchParams(sea, resolveTarget('У моря', destinations)!), destinations)).toEqual(sea)
  })

  it('leaves an unknown or missing destination and missing dates empty, with default guests', () => {
    expect(fromSearchParams(new URLSearchParams('destination=atlantis'), destinations)).toEqual({
      destination: '',
      checkIn: '',
      checkOut: '',
      guests: { adults: 2, children: 0, rooms: 1 },
    })
  })

  it('keeps malformed guest counts for validation to report', () => {
    const read = fromSearchParams(
      new URLSearchParams('destination=prague&checkin=2026-10-20&checkout=2026-10-21&adults=x&rooms=1'),
      destinations,
    )
    expect(read.guests.adults).toBeNaN()
    expect(validateSearch(read, '2026-10-19', destinations).guests).toBe('Проверьте количество гостей')
  })
})

describe('withStartDates', () => {
  const empty: SearchQuery = {
    destination: '',
    checkIn: '',
    checkOut: '',
    guests: { adults: 2, children: 0, rooms: 1 },
  }

  it('fills empty dates with tomorrow and the night after', () => {
    expect(withStartDates(empty, '2026-10-19')).toMatchObject({ checkIn: '2026-10-20', checkOut: '2026-10-21' })
  })

  it('keeps chosen dates and waits for today to be known', () => {
    const chosen = { ...empty, checkIn: '2026-11-01', checkOut: '2026-11-04' }
    expect(withStartDates(chosen, '2026-10-19')).toEqual(chosen)
    expect(withStartDates(empty, '')).toBe(empty)
  })
})

describe('parseGuestParams', () => {
  it('reads the guests whatever the dates', () => {
    expect(parseGuestParams(new URLSearchParams('adults=3&children=1&rooms=2'))).toEqual({
      adults: 3,
      children: 1,
      rooms: 2,
    })
  })

  it('is null without any guest parameter, and keeps malformed counts as NaN', () => {
    expect(parseGuestParams(new URLSearchParams('checkin=2099-01-10'))).toBeNull()
    expect(parseGuestParams(new URLSearchParams('adults=x'))).toEqual({ adults: NaN, children: 0, rooms: NaN })
  })

  it('leaves parseStayParams null without dates and NaN guests without guest parameters', () => {
    expect(parseStayParams(new URLSearchParams('adults=3&rooms=1'))).toBeNull()
    expect(parseStayParams(new URLSearchParams('checkin=2099-01-10&checkout=2099-01-12'))?.guests).toEqual({
      adults: NaN,
      children: 0,
      rooms: NaN,
    })
  })
})
