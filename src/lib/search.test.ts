import { afterEach, describe, expect, it, vi } from 'vitest'
import { setProduction } from '@/test/env'
import { destinations } from '../data/destinations'
import {
  findScenario,
  fromSearchParams,
  parseGuestParams,
  parseSelection,
  parseStayParams,
  resolveTarget,
  selectionHref,
  suggestDestinations,
  toSearchParams,
  validateSearch,
  withStartDates,
  type SearchQuery,
} from './search'

vi.mock('@/lib/env', () => import('@/test/env'))
afterEach(() => setProduction(false))

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
    expect(findScenario('  нА вЫХОДНЫЕ ', destinations)).toMatchObject({ id: 'weekend' })
    expect(findScenario('Города Ёвропы', destinations)).toMatchObject({ id: 'europe' })
  })

  it('returns undefined for empty or unknown text', () => {
    expect(findScenario('   ', destinations)).toBeUndefined()
    expect(findScenario('В горы', destinations)).toBeUndefined()
  })

  // hotel-catalog, Requirement: Синтетические отели только вне production
  it('hides a scenario no destination shown has', () => {
    const valencia = destinations.filter((d) => d.id === 'valencia')
    expect(findScenario('На выходные', valencia)).toBeUndefined()
    expect(resolveTarget('На выходные', valencia)).toBeNull()
    expect(fromSearchParams(new URLSearchParams('scenario=weekend'), valencia).destination).toBe('')
    expect(findScenario('Города Европы', valencia)).toMatchObject({ id: 'europe' })
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
    // "ис" starts "Испания" (Madrid, Barcelona, Valencia) and "Исландия" (Reykjavik), and occurs inside the others.
    expect(ids(suggestDestinations('ис', destinations))).toEqual([
      'madrid',
      'barcelona',
      'reykjavik',
      'valencia',
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

// search-results-page, Requirement: Подборка отелей
describe('selectionHref', () => {
  const stay = { checkIn: '2026-10-20', checkOut: '2026-10-21', guests: { adults: 2, children: 0, rooms: 1 } }

  it('writes the hotels, the source, the pick and the stay of every source in one address', () => {
    expect(selectionHref({ hotels: ['ota-1', 'rome-a'], from: 'vibe', pick: 'quiet-harbour' }, stay)).toBe(
      '/search?hotels=ota-1,rome-a&from=vibe&pick=quiet-harbour&checkin=2026-10-20&checkout=2026-10-21&adults=2&rooms=1',
    )
    expect(selectionHref({ hotels: ['ota-1'], from: 'stars', pick: 'aries' }, stay)).toMatch(
      /^\/search\?hotels=ota-1&from=stars&pick=aries&checkin=/,
    )
    expect(selectionHref({ hotels: ['ota-1'], from: 'draw', pick: 'minimalist' }, null)).toBe(
      '/search?hotels=ota-1&from=draw&pick=minimalist',
    )
  })

  it('is read back by parseSelection and fromSearchParams', () => {
    const href = selectionHref({ hotels: ['ota-1', 'rome-a'], from: 'draw', pick: 'minimalist' }, stay)
    const params = new URL(href, 'https://x').searchParams
    expect(parseSelection(params)).toEqual({
      kind: 'selection',
      hotels: ['ota-1', 'rome-a'],
      title: 'Подборка по вашему рисунку: Эстет-минималист',
    })
    expect(fromSearchParams(params, destinations)).toEqual({ destination: '', ...stay })
  })
})

describe('parseSelection', () => {
  const parse = (search: string) => parseSelection(new URLSearchParams(search))

  it('is null without hotels', () => {
    expect(parse('destination=prague')).toBeNull()
  })

  it('titles the selection by its source', () => {
    expect(parse('hotels=a&from=vibe&pick=quiet-harbour')?.title).toBe('Подборка по вашему вайбу: Тихая гавань')
    expect(parse('hotels=a&from=vibe&pick=balance')?.title).toBe('Подборка по вашему вайбу: Баланс во всём')
    expect(parse('hotels=a&from=stars&pick=aries')?.title).toBe('Подборка звёзд для Овна')
    expect(parse('hotels=a&from=stars&pick=pisces')?.title).toBe('Подборка звёзд для Рыб')
    expect(parse('hotels=a&from=draw&pick=luxury')?.title).toBe('Подборка по вашему рисунку: Ценитель роскоши')
  })

  // Scenario: Неизвестный источник
  it('titles an unknown source or pick «Подобранные отели»', () => {
    for (const search of [
      'hotels=a',
      'hotels=a&from=vibe',
      'hotels=a&from=vibe&pick=aries',
      'hotels=a&from=stars&pick=quiet-harbour',
      'hotels=a&from=toString&pick=x',
      'hotels=a&from=ai&pick=<b>hi</b>',
    ])
      expect(parse(search)?.title, search).toBe('Подобранные отели')
  })

  it('skips malformed and repeated ids', () => {
    expect(parse('hotels=ota-1,,OTA-2,ota-1,rome-a,a%20b,../x')?.hotels).toEqual(['ota-1', 'rome-a'])
  })

  it('skips the hidden hotels: production shows only the real ones', () => {
    expect(parse('hotels=ota-1,rome-a')?.hotels).toEqual(['ota-1', 'rome-a'])
    setProduction(true)
    expect(parse('hotels=ota-1,rome-a')?.hotels).toEqual(['ota-1'])
  })

  it('keeps at most 60 hotels, as /api/hotels loads', () => {
    const many = Array.from({ length: 70 }, (_, i) => `ota-${i}`)
    expect(parse(`hotels=${many.join(',')}`)?.hotels).toEqual(many.slice(0, 60))
  })
})
