import { describe, expect, it } from 'vitest'
import { seedRoutes } from '../data/routes'
import { cheapestRate, type Hotel } from './catalog'
import { getHotel } from './catalogGenerator'
import { addDays } from './dates'
import { stayTotal } from './offer'
import {
  bestRoute,
  buildPlan,
  CAR_RENTAL_PER_DAY,
  defaultState,
  distanceKm,
  legMinutes,
  legPrice,
  parseRoute,
  parseRouteState,
  previewPlan,
  toRouteParams,
  type Route,
  type RouteCardData,
  type RouteState,
} from './routes'

const TODAY = '2026-11-02'
const route = seedRoutes[0]
const hotels: Record<string, Hotel> = Object.fromEntries(
  route.stops.map(({ hotelId }) => [hotelId, getHotel(hotelId)!]),
)
const hasHotel = (id: string) => Boolean(getHotel(id))
const state = (edits: Partial<RouteState> = {}): RouteState => ({ ...defaultState(route, TODAY), ...edits })
const transfersOf = (plan: ReturnType<typeof buildPlan>) =>
  plan.days.flatMap((day) => day.items.filter((item) => item.kind === 'transfer'))

// routes, Requirement: Модель маршрута
describe('parseRoute', () => {
  it('accepts the seed routes, whose hotels are all in the catalog', () => {
    for (const seed of seedRoutes) expect(parseRoute(structuredClone(seed), hasHotel)).toEqual(seed)
  })

  it('rejects a route with a hotel that is not in the catalog', () => {
    const broken = { ...route, stops: [{ hotelId: 'prague-nowhere', nights: 3 }, route.stops[1]] }
    expect(() => parseRoute(broken, hasHotel)).toThrow('отеля prague-nowhere нет в каталоге')
  })

  it('rejects a malformed route: a transfer per leg is required', () => {
    expect(() => parseRoute({ ...route, transfers: ['taxi'] }, hasHotel)).toThrow('transfers')
    expect(() => parseRoute({ ...route, persona: 'pirate' }, hasHotel)).toThrow('Маршрут не прошёл проверку')
  })

  it('gives the seed route 3–5 nights in total by default', () => {
    const nights = route.stops.reduce((total, stop) => total + stop.nights, 0)
    expect(nights).toBeGreaterThanOrEqual(3)
    expect(nights).toBeLessThanOrEqual(5)
  })
})

describe('the edits in the address', () => {
  it('starts tomorrow with the route’s nights and transfers', () => {
    expect(parseRouteState(route, new URLSearchParams(), TODAY)).toEqual({
      start: '2026-11-03',
      nights: [3, 2],
      transfers: ['transfer', 'taxi', 'taxi'],
    })
  })

  it('reads the start, the nights and the transfers', () => {
    const params = new URLSearchParams('start=2026-12-01&nights=4,2&t=0:taxi,1:walk,2:none')
    expect(parseRouteState(route, params, TODAY)).toEqual({
      start: '2026-12-01',
      nights: [4, 2],
      transfers: ['taxi', 'walk', 'none'],
    })
  })

  it('ignores malformed values and keeps their defaults', () => {
    const params = new URLSearchParams('start=2026-02-30&nights=0,x,9&t=7:taxi,1:plane,a:walk,2:car')
    expect(parseRouteState(route, params, TODAY)).toEqual({
      start: '2026-11-03',
      nights: [3, 2],
      transfers: ['transfer', 'taxi', 'car'],
    })
    expect(parseRouteState(route, new URLSearchParams('start=2026-11-01'), TODAY).start).toBe('2026-11-03')
    expect(parseRouteState(route, new URLSearchParams('start=2028-01-01'), TODAY).start).toBe('2026-11-03')
    expect(parseRouteState(route, new URLSearchParams('nights=31,2'), TODAY).nights).toEqual([3, 2])
  })

  it('writes only what differs from the route and reads it back', () => {
    expect(toRouteParams(route, state()).toString()).toBe('start=2026-11-03')
    const edited = state({ nights: [4, 2], transfers: ['transfer', 'walk', 'none'] })
    const params = toRouteParams(route, edited)
    expect(params.toString()).toBe('start=2026-11-03&nights=4%2C2&t=1%3Awalk%2C2%3Anone')
    expect(parseRouteState(route, params, TODAY)).toEqual(edited)
  })
})

describe('legs', () => {
  it('measures the great-circle distance', () => {
    expect(distanceKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBe(111.2)
    expect(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0)
  })

  it('prices and times each mode', () => {
    expect(legPrice('transfer', 10)).toBe(2100)
    expect(legPrice('taxi', 10)).toBe(1250)
    expect(legPrice('car', 10)).toBe(0)
    expect(legPrice('walk', 10)).toBe(0)
    expect(legMinutes('taxi', 10)).toBe(30)
    expect(legMinutes('car', 0.1)).toBe(1)
    expect(legMinutes('walk', 1.7)).toBe(21)
    expect(legMinutes('walk', 0)).toBe(1)
  })
})

// routes, Requirements: Расчёт ночей, Расчёт трансферов
describe('buildPlan', () => {
  const plan = buildPlan(route, hotels, state())

  it('lays out the days from arrival to departure', () => {
    expect(plan.start).toBe('2026-11-03')
    expect(plan.end).toBe('2026-11-08')
    expect(plan.days.map((day) => day.date)).toEqual(Array.from({ length: 6 }, (_, i) => addDays('2026-11-03', i)))
    expect(plan.days[0].items.map((item) => item.kind)).toEqual(['arrival', 'transfer', 'check-in'])
    expect(plan.days[3].items.map((item) => item.kind)).toEqual(['check-out', 'transfer', 'check-in', 'leisure'])
    expect(plan.days.at(-1)!.items.map((item) => item.kind)).toEqual(['check-out', 'transfer', 'departure'])
    // Every item is in time order within its day.
    for (const day of plan.days)
      expect(day.items.map((item) => item.start)).toEqual(day.items.map((item) => item.start).toSorted((a, b) => a - b))
  })

  it('makes each transfer its own item with mode, time and price', () => {
    expect(transfersOf(plan).map((item) => [item.mode, item.from, item.to])).toEqual([
      ['transfer', 'Аэропорт Вацлава Гавела', hotels['prague-mala-strana-residence'].name],
      ['taxi', hotels['prague-mala-strana-residence'].name, hotels['prague-vltava-loft-rooms'].name],
      ['taxi', hotels['prague-vltava-loft-rooms'].name, 'Главный вокзал Праги'],
    ])
    const first = transfersOf(plan)[0]
    expect(first.price).toBe(legPrice('transfer', first.km))
    expect(first.minutes).toBe(legMinutes('transfer', first.km))
  })

  it('keeps the leisure out of the main costs', () => {
    const stays = route.stops.map((stop, i) => {
      const checkIn = addDays('2026-11-03', i === 0 ? 0 : 3)
      const rate = cheapestRate(hotels[stop.hotelId]).rate.pricePerNight
      return stayTotal(rate, checkIn, addDays(checkIn, stop.nights), 1)
    })
    const transfers = transfersOf(plan).reduce((total, item) => total + item.price, 0)
    expect(plan.main).toBe(stays[0] + stays[1] + transfers)
    expect(plan.extras).toBe(route.leisure.reduce((total, item) => total + item.price, 0))
  })

  it('moves the check-out and the price after one more night', () => {
    const longer = buildPlan(route, hotels, state({ nights: [4, 2] }))
    expect(longer.stays[0].checkOut).toBe('2026-11-07')
    expect(longer.stays[1].checkIn).toBe('2026-11-07')
    expect(longer.end).toBe('2026-11-09')
    expect(longer.days).toHaveLength(7)
    expect(longer.main).toBeGreaterThan(plan.main)
  })

  it('walks for free and removes a transfer with its price', () => {
    const taxi = transfersOf(plan)[1]
    const walked = buildPlan(route, hotels, state({ transfers: ['transfer', 'walk', 'taxi'] }))
    const walk = transfersOf(walked)[1]
    expect(walk.mode).toBe('walk')
    expect(walk.price).toBe(0)
    expect(walk.minutes).toBe(legMinutes('walk', taxi.km))
    expect(walked.main).toBe(plan.main - taxi.price)

    const removed = buildPlan(route, hotels, state({ transfers: ['transfer', 'none', 'taxi'] }))
    expect(transfersOf(removed).map((item) => item.leg)).toEqual([0, 2])
    expect(removed.main).toBe(plan.main - taxi.price)
  })

  it('rents a car once for the whole stay', () => {
    const car = buildPlan(route, hotels, state({ transfers: ['car', 'car', 'taxi'] }))
    expect(car.carRental).toEqual({ days: 5, price: 5 * CAR_RENTAL_PER_DAY })
    expect(
      transfersOf(car)
        .slice(0, 2)
        .map((item) => item.price),
    ).toEqual([0, 0])
    const [transfer] = transfersOf(plan)
    expect(car.main).toBe(plan.main - transfer.price - transfersOf(plan)[1].price + 5 * CAR_RENTAL_PER_DAY)
    expect(plan.carRental).toBeNull()
  })

  it('drops the leisure of days past a shorter trip', () => {
    const short = buildPlan(route, hotels, state({ nights: [1, 1] }))
    const titles = short.days.flatMap((day) =>
      day.items.flatMap((item) => (item.kind === 'leisure' ? item.leisure.title : [])),
    )
    expect(titles).toEqual(route.leisure.filter((item) => item.day <= 3).map((item) => item.title))
    expect(short.extras).toBe(route.leisure.filter((item) => item.day <= 3).reduce((t, item) => t + item.price, 0))
  })

  it('waits for the check-in hour after an early arrival', () => {
    const early: Route = { ...route, arrival: { ...route.arrival, time: '08:00' } }
    const checkIn = buildPlan(early, hotels, state()).days[0].items.find((item) => item.kind === 'check-in')!
    expect(checkIn.start).toBe(14 * 60)
  })
})

// routes, Requirement: Оценка цены маршрута
describe('previewPlan', () => {
  it('estimates the route as published at weekday prices', () => {
    const preview = previewPlan(route, hotels)
    expect(preview.nights).toBe(5)
    expect(preview.days).toHaveLength(6)
    expect(preview.stays.map((stay) => stay.price)).toEqual(
      route.stops.map((stop) => cheapestRate(hotels[stop.hotelId]).rate.pricePerNight * stop.nights),
    )
    const transfers = transfersOf(preview).reduce((total, item) => total + item.price, 0)
    expect(preview.main).toBe(preview.stays[0].price + preview.stays[1].price + transfers)
    expect(preview.extras).toBe(route.leisure.reduce((total, item) => total + item.price, 0))
  })
})

// routes, Requirement: Лучший готовый маршрут
describe('bestRoute', () => {
  const card = (id: string, persona: RouteCardData['persona'], destinationId: string, featured = false) =>
    ({ id, persona, destinationId, featured }) as RouteCardData
  const cards = [
    card('tbilisi-student', 'student', 'tbilisi'),
    card('almaty-workation', 'workation', 'almaty'),
    card('lisbon-workation', 'workation', 'lisbon'),
    card('rome-luxury', 'luxury', 'rome', true),
  ]

  it('takes the search by meaning’s route first', () => {
    expect(bestRoute(cards, { semanticId: 'rome-luxury', persona: 'workation', destinationId: 'lisbon' })?.id).toBe(
      'rome-luxury',
    )
  })

  it('without it, the persona’s route in the city (Scenario: Поиск по смыслу недоступен)', () => {
    expect(bestRoute(cards, { semanticId: null, persona: 'workation', destinationId: 'lisbon' })?.id).toBe(
      'lisbon-workation',
    )
    // An id the cards do not have is no hit.
    expect(bestRoute(cards, { semanticId: 'gone', persona: 'workation', destinationId: 'lisbon' })?.id).toBe(
      'lisbon-workation',
    )
  })

  it('then the persona’s first route, then the first featured, then the first', () => {
    expect(bestRoute(cards, { persona: 'workation', destinationId: 'tokyo' })?.id).toBe('almaty-workation')
    expect(bestRoute(cards, { persona: 'culture', destinationId: 'lisbon' })?.id).toBe('rome-luxury')
    expect(bestRoute(cards.slice(0, 1), { persona: 'culture' })?.id).toBe('tbilisi-student')
  })

  it('gives nothing without routes (Scenario: Нет маршрутов)', () => {
    expect(bestRoute([], { persona: 'student' })).toBeNull()
  })
})
