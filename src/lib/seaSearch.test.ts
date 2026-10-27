import { describe, expect, it } from 'vitest'
import { destinations } from '@/data/destinations'
import { hotels } from '@/lib/catalogGenerator'
import {
  NEAR_SEA_M,
  describeBrief,
  makePlan,
  mergeBrief,
  normalizeBrief,
  parseWish,
  planCities,
  type Brief,
} from './assistant'
import {
  criteriaOf,
  featureReasons,
  missingCriteria,
  rankByFeatures,
  withSeaDistances,
  type HotelFeatures,
} from './features'
import { formatMeters } from './format'
import { REMOVED, paramLine, parseParams, savedParams, sessionParams, stayLabel } from './sessionMemory'

const valencia = destinations.filter((d) => d.id === 'valencia')
const today = '2026-10-27'

// assistant-search, Requirement: Условие расстояния до моря
describe('the distance to the sea in the wish', () => {
  it.each([
    ['Только близко к морю', NEAR_SEA_M],
    ['Я хочу ближе к морю', NEAR_SEA_M],
    ['чтобы пляж был рядом', NEAR_SEA_M],
    ['отель рядом с морем', NEAR_SEA_M],
    ['на первой линии', NEAR_SEA_M],
    ['до моря не больше 500 м', 500],
    ['в 2 км от моря', 2000],
    ['300 метров до пляжа', 300],
    ['до моря 1,5 км', 1500],
  ])('reads «%s» as %i m', (text, meters) => {
    expect(parseWish(text, destinations).seaMaxM).toBe(meters)
  })

  it.each(['на море в октябре', 'номер с видом на море', 'море, 5 км от центра', 'в Валенсию на 5 ночей'])(
    'takes no distance from «%s»',
    (text) => {
      expect(parseWish(text, destinations).seaMaxM).toBeUndefined()
    },
  )

  it('does not take a distance for the budget', () => {
    expect(parseWish('в 3000 м от моря', destinations)).toMatchObject({ seaMaxM: 3000 })
    expect(parseWish('в 3000 м от моря', destinations).budget).toBeUndefined()
  })

  it('keeps the distance of an earlier message and lets a later one change it', () => {
    const first = mergeBrief({}, 'Я хочу ближе к морю', null, destinations)
    expect(first).toMatchObject({ vibe: 'sea', seaMaxM: 1000 })
    expect(mergeBrief(first, 'Один', 'party', destinations)).toMatchObject({ seaMaxM: 1000, party: 'solo' })
    expect(mergeBrief(first, 'до моря не больше 300 м', null, destinations).seaMaxM).toBe(300)
  })

  it('normalizes the distance and the guests of an untrusted brief', () => {
    expect(normalizeBrief({ seaMaxM: 10, guests: { adults: 1, children: 0, rooms: 1 } }, destinations)).toEqual({
      seaMaxM: 50,
      guests: { adults: 1, children: 0, rooms: 1 },
    })
    expect(normalizeBrief({ seaMaxM: 'near', guests: { adults: 1, children: 0, rooms: 3 } }, destinations)).toEqual({})
  })

  it('tells the distance among what is understood', () => {
    expect(describeBrief({ vibe: 'sea', seaMaxM: 1000 }, destinations)).toBe('море · до моря до 1 км')
  })
})

// assistant-search, Requirement: Подбор у моря
describe('the cities of the sea in winter', () => {
  const november: Brief = {
    vibe: 'sea',
    dates: { checkIn: '2026-11-25', checkOut: '2026-11-30' },
    when: 10,
    nights: 5,
    party: 'solo',
  }

  it('keeps the warm beaches only for a plain «на море» in winter', () => {
    expect(planCities(november, today, destinations).map((d) => d.id)).not.toContain('valencia')
  })

  it('keeps every city by the sea once a distance to the sea is named (the bug: Valencia was dropped in November)', () => {
    const ids = planCities({ ...november, seaMaxM: 1000 }, today, destinations).map((d) => d.id)
    expect(ids).toContain('valencia')
    expect(ids).toContain('dubai')
  })

  it('never leaves the traveller’s sea without a city: production shows Valencia only', () => {
    expect(planCities(november, today, valencia).map((d) => d.id)).toEqual(['valencia'])
    expect(planCities({ ...november, seaMaxM: 1000 }, today, valencia).map((d) => d.id)).toEqual(['valencia'])
  })
})

describe('the sea criterion of the features', () => {
  const near: HotelFeatures = { views: [], seaM: 223 }
  const far: HotelFeatures = { views: [], seaM: 1400 }
  const features = new Map<string, HotelFeatures>([
    ['near', near],
    ['nearest', { views: [], seaM: 186 }],
    ['far', far],
    ['unknown', { views: [], floors: 5 }],
  ])

  it('comes first of the criteria, so it is let go last', () => {
    expect(criteriaOf({ quiet: true, seaMaxM: 1000 })).toEqual(['sea', 'quiet'])
  })

  it('ranks the hotels within the distance, the nearest first', () => {
    expect(rankByFeatures(['far', 'near', 'unknown', 'nearest'], features, { seaMaxM: 1000 })).toEqual([
      'nearest',
      'near',
    ])
    expect(rankByFeatures(['far', 'near'], features, { seaMaxM: 100 })).toEqual([])
  })

  it('is missing only when no hotel has a distance, near or far', () => {
    expect(missingCriteria(['far'], features, { seaMaxM: 100 })).toEqual([])
    expect(missingCriteria(['unknown'], features, { seaMaxM: 1000 })).toEqual(['sea'])
  })

  it('tells the distance of the hotel', () => {
    expect(featureReasons(near, { seaMaxM: 1000 })).toEqual(['до моря 220 м'])
    expect(featureReasons(undefined, { seaMaxM: 1000 })).toEqual(['нет данных о расстоянии до моря'])
    expect(formatMeters(1000)).toBe('1 км')
    expect(formatMeters(1460)).toBe('1,5 км')
  })

  it('merges the distances into the features', () => {
    const merged = withSeaDistances(new Map([['a', { views: [], floors: 3 }]]), [
      { hotel_id: 'a', sea_m: 300 },
      { hotel_id: 'b', sea_m: 900 },
    ])
    expect(merged.get('a')).toEqual({ views: [], floors: 3, seaM: 300 })
    expect(merged.get('b')).toEqual({ views: [], seaM: 900 })
  })
})

describe('the strict plan by the sea', () => {
  const barcelona = destinations.filter((d) => d.id === 'barcelona')
  const inCity = hotels.filter((h) => h.destinationId === 'barcelona').slice(0, 4)
  const brief: Brief = { vibe: 'sea', destinationId: 'barcelona', party: 'solo', when: 10, seaMaxM: 1000 }

  it('takes only the matches within the distance and adds none by the rules', () => {
    const features = {
      [inCity[0].id]: { views: [], seaM: 400 },
      [inCity[1].id]: { views: [], seaM: 2400 },
    }
    const plan = makePlan(brief, today, barcelona, hotels, inCity, features)
    expect(plan.options.map((o) => o.hotel?.id)).toEqual([inCity[0].id])
    expect(plan.options[0].reasons).toEqual(['до моря 400 м'])
    expect(plan.query.guests).toEqual({ adults: 1, children: 0, rooms: 1 })
  })

  it('is empty when no hotel is within the distance', () => {
    expect(makePlan(brief, today, barcelona, hotels, inCity, {}).options).toEqual([])
  })

  it('goes by the guests set by hand', () => {
    const plan = makePlan(
      { ...brief, guests: { adults: 3, children: 1, rooms: 2 } },
      today,
      barcelona,
      hotels,
      [],
      {},
      undefined,
      false,
    )
    expect(plan.query.guests).toEqual({ adults: 3, children: 1, rooms: 2 })
  })
})

// assistant-search, Requirement: Память сессии в ленте
describe('the memory of the session', () => {
  it('lists the parameters the brief has', () => {
    const brief: Brief = {
      vibe: 'sea',
      dates: { checkIn: '2026-11-25', checkOut: '2026-11-30' },
      when: 10,
      nights: 5,
      party: 'solo',
      seaMaxM: 1000,
    }
    expect(sessionParams(brief, destinations).map(paramLine)).toEqual([
      'Даты: 25–30 нояб.',
      'Гости: 1 взрослый',
      'Номера: 1 номер',
      'Тема: море',
      'Расстояние до моря: до 1 км',
    ])
  })

  it('saves only what changed; the named days take the place of the month', () => {
    const before: Brief = { vibe: 'sea', seaMaxM: 1000, when: 10 }
    const after: Brief = { ...before, dates: { checkIn: '2026-11-25', checkOut: '2026-11-30' }, nights: 5 }
    expect(savedParams(before, after, destinations).map(paramLine)).toEqual(['Даты: 25–30 нояб.'])
    expect(savedParams(after, after, destinations)).toEqual([])
  })

  it('says a parameter taken away is «не важно»', () => {
    expect(savedParams({ seaMaxM: 300 }, {}, destinations)).toEqual([
      { key: 'sea', label: 'Расстояние до моря', value: REMOVED },
    ])
  })

  it('reads the stored parameters, dropping damaged ones', () => {
    expect(parseParams([{ key: 'sea', label: 'Расстояние до моря', value: 'до 1 км' }, { key: 'x' }, null])).toEqual([
      { key: 'sea', label: 'Расстояние до моря', value: 'до 1 км' },
    ])
    expect(parseParams('нет')).toBeUndefined()
  })

  it('writes the days of two months in full', () => {
    expect(stayLabel('2026-11-30', '2026-12-02')).toBe('30 нояб. – 2 дек.')
  })
})
