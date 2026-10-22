import { describe, expect, it } from 'vitest'
import { seedRoutes } from '../data/routes'
import type { Hotel } from './catalog'
import { fullHotelsIn, getHotel } from './catalogGenerator'
import { toIcs } from './ics'
import { buildPlan } from './routes'
import {
  copyRoute,
  dayLeisure,
  moveLeisure,
  moveLeisureToDay,
  parseEdits,
  parseTrip,
  removeLeisure,
  replaceHotel,
  replaceLeisure,
  restoreTransfer,
  setLeisureTime,
  setNights,
  setStart,
  setTransfer,
  stayPrice,
  summarizeTrip,
  tripDays,
  tripEdits,
  tripEvents,
  tripPlan,
} from './trip'

const TODAY = '2026-11-02'
const route = seedRoutes[0]
const trip = copyRoute(route, TODAY)
const hotels: Record<string, Hotel> = Object.fromEntries(
  route.stops.map(({ hotelId }) => [hotelId, getHotel(hotelId)!]),
)
const transfers = (plan: ReturnType<typeof tripPlan>) =>
  plan.days.flatMap((day) => day.items.filter((item) => item.kind === 'transfer'))
const titlesOf = (t: typeof trip, day: number) => dayLeisure(t, day).map((item) => item.title)

// trip-plan, Requirement: Копия маршрута
describe('copyRoute', () => {
  it('snapshots the route from tomorrow with its nights, transfers and leisure, each item with an id', () => {
    expect(trip.start).toBe('2026-11-03')
    expect(trip.stops).toEqual(route.stops)
    expect(trip.transfers).toEqual(route.transfers)
    expect(trip.leisure.map((item) => item.id)).toEqual(['l1', 'l2', 'l3', 'l4', 'l5'])
    expect(trip.stops).not.toBe(route.stops)
  })

  it('plans as the route does, with real dates', () => {
    const plan = tripPlan(trip, hotels)
    const state = { start: trip.start, nights: [3, 2], transfers: [...route.transfers] }
    const expected = buildPlan(route, hotels, state)
    expect(plan.main).toBe(expected.main)
    expect(plan.extras).toBe(expected.extras)
    expect(plan.end).toBe('2026-11-08')
  })

  it('reads back what it stored, and a stored plan keeps its route when the route changes later', () => {
    const stored = JSON.parse(JSON.stringify(trip))
    expect(parseTrip(stored)).toEqual(trip)
    expect(parseTrip(stored).route.title).toBe('Культурный отпуск в Праге')
  })
})

describe('parseEdits', () => {
  const edits = tripEdits(trip)
  it('accepts the edits of the plan', () => expect(parseEdits(structuredClone(edits), route)).toEqual(edits))
  it('rejects edits that do not fit the route', () => {
    expect(() => parseEdits({ ...edits, stops: edits.stops.slice(1) }, route)).toThrow('другое число точек')
    expect(() => parseEdits({ ...edits, transfers: ['taxi'] }, route)).toThrow('трансферы')
    expect(() => parseEdits({ ...edits, start: '2026-02-30' }, route)).toThrow('План не прошёл проверку')
    expect(() => parseEdits({ ...edits, stops: [{ hotelId: 'x', nights: 0 }, edits.stops[1]] }, route)).toThrow()
    const twice = [...edits.leisure, edits.leisure[0]]
    expect(() => parseEdits({ ...edits, leisure: twice }, route)).toThrow('повтор id')
  })
})

// trip-plan, Requirement: Правки плана
describe('the edits', () => {
  it('a night more moves the later dates and adds a day', () => {
    const plan = tripPlan(setNights(trip, 0, 4), hotels)
    expect(plan.nights).toBe(6)
    expect(plan.end).toBe('2026-11-09')
    expect(plan.stays[1].checkIn).toBe('2026-11-07')
    expect(tripDays(setNights(trip, 0, 4))).toBe(7)
  })

  it('keeps at least one night', () => expect(setNights(trip, 1, 0).stops[1].nights).toBe(1))

  it('a new start date moves the whole plan', () => {
    const plan = tripPlan(setStart(trip, '2026-12-01'), hotels)
    expect(plan.days[0].date).toBe('2026-12-01')
    expect(plan.end).toBe('2026-12-06')
  })

  it('walking is free, a removed transfer leaves the plan and «Вернуть» brings the route’s mode back', () => {
    const base = tripPlan(trip, hotels)
    const walk = tripPlan(setTransfer(trip, 1, 'walk'), hotels)
    const taxi = transfers(base)[1]
    expect(taxi.kind === 'transfer' && taxi.price).toBeGreaterThan(0)
    expect(walk.main).toBe(base.main - (taxi.kind === 'transfer' ? taxi.price : 0))
    const removed = setTransfer(trip, 1, 'none')
    expect(transfers(tripPlan(removed, hotels))).toHaveLength(2)
    expect(restoreTransfer(removed, 1).transfers).toEqual(route.transfers)
  })

  it('a cheaper hotel lowers the main costs by its price difference and the transfers to it', () => {
    const plan = tripPlan(trip, hotels)
    const stay = plan.stays[0]
    const other = fullHotelsIn('prague').find((h) => h.id !== stay.hotel.id && h.priceFrom < stay.hotel.priceFrom)!
    const next = tripPlan(replaceHotel(trip, 0, other.id), { ...hotels, [other.id]: other })
    const hotelDifference = stayPrice(other, stay.checkIn, stay.checkOut) - stay.price
    const sumTransfers = (p: typeof plan) =>
      transfers(p).reduce((total, item) => total + (item.kind === 'transfer' ? item.price : 0), 0)
    expect(next.main - plan.main).toBe(hotelDifference + sumTransfers(next) - sumTransfers(plan))
    expect(next.stays[0].hotel.id).toBe(other.id)
  })
})

// trip-plan, Requirement: Порядок досуга
describe('the order of the leisure', () => {
  it('moves an item down and up within its day, the items taking the day’s times in turn', () => {
    expect(titlesOf(trip, 2)).toEqual([
      'Пражский Град и собор Святого Вита',
      'Органный концерт в соборе Святого Николая',
    ])
    const down = moveLeisure(trip, 'l1', 1)
    expect(titlesOf(down, 2)).toEqual([
      'Органный концерт в соборе Святого Николая',
      'Пражский Град и собор Святого Вита',
    ])
    expect(dayLeisure(down, 2).map((item) => item.time)).toEqual(['10:00', '19:00'])
    expect(moveLeisure(down, 'l1', -1).leisure).toEqual(trip.leisure)
  })

  it('does nothing past the ends of the day', () => {
    expect(moveLeisure(trip, 'l1', -1)).toBe(trip)
    expect(moveLeisure(trip, 'l2', 1)).toBe(trip)
  })

  it('keeps the new order for items at the same time', () => {
    const same = setLeisureTime(trip, 'l2', '10:00')
    expect(titlesOf(moveLeisure(same, 'l2', -1), 2)[0]).toBe('Органный концерт в соборе Святого Николая')
  })

  it('a drop takes the place of the item it lands on', () => {
    const three = moveLeisureToDay(trip, 'l3', 2)
    expect(titlesOf(moveLeisure(three, 'l3', 'l1'), 2)[0]).toBe('Музей Альфонса Мухи')
  })

  it('the concert moved from day 2 to day 3 keeps its time and the extras stay the same', () => {
    const moved = moveLeisureToDay(trip, 'l2', 3)
    const plan = tripPlan(moved, hotels)
    const day3 = plan.days[2].items.filter((item) => item.kind === 'leisure').map((item) => item.leisure.title)
    expect(day3).toContain('Органный концерт в соборе Святого Николая')
    expect(moved.leisure[1].time).toBe('19:00')
    expect(plan.extras).toBe(tripPlan(trip, hotels).extras)
  })

  it('a malformed time is ignored; a removed item leaves the extras', () => {
    expect(setLeisureTime(trip, 'l1', '25:00')).toBe(trip)
    expect(tripPlan(removeLeisure(trip, 'l5'), hotels).extras).toBe(tripPlan(trip, hotels).extras - 2600)
  })

  it('an alternative takes the place, day and time of the item with a new id', () => {
    const next = replaceLeisure(trip, 'l2', { title: 'Джаз в клубе', category: 'Концерт', minutes: 120, price: 1500 })
    expect(next.leisure[1]).toEqual({
      id: 'l6',
      title: 'Джаз в клубе',
      category: 'Концерт',
      minutes: 120,
      price: 1500,
      day: 2,
      time: '19:00',
    })
  })
})

// trip-plan, Requirement: Экспорт плана
describe('tripEvents', () => {
  it('names the events by the plan and keeps a leisure event across a move', () => {
    const plan = tripPlan(trip, hotels)
    const events = tripEvents('9b2f', trip, plan)
    expect(new Set(events.map((e) => e.uid)).size).toBe(events.length)
    expect(events.find((e) => e.summary === 'Музей Альфонса Мухи')?.uid).toBe('trip-9b2f-leisure-l3@opognali')
    const moved = moveLeisureToDay(trip, 'l3', 4)
    const after = tripEvents('9b2f', moved, tripPlan(moved, hotels))
    expect(after.find((e) => e.uid === 'trip-9b2f-leisure-l3@opognali')?.date).toBe('2026-11-06')
    const ics = toIcs(trip.route.title, events, new Date('2026-11-02T10:00:00Z'))
    expect(ics).toContain('TRIGGER:-P1D')
    expect(ics).toContain('TRIGGER:-PT1H')
  })
})

describe('summarizeTrip', () => {
  it('gives the card of «Мои планы»', () => {
    const plan = tripPlan(trip, hotels)
    expect(summarizeTrip('id-1', trip, hotels, 'Прага')).toEqual({
      id: 'id-1',
      title: 'Культурный отпуск в Праге',
      city: 'Прага',
      start: '2026-11-03',
      end: '2026-11-08',
      nights: 5,
      main: plan.main,
      extras: 7700,
    })
  })
})
