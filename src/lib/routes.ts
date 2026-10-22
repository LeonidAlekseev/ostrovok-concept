import { z } from 'zod'
import { cheapestRate, travelTimes, type Hotel } from './catalog'
import { addDays, fromIso, nightsBetween, toIso, type IsoDate } from './dates'
import type { CalendarEvent } from './ics'
import { stayTotal } from './offer'
import { MAX_NIGHTS } from './search'

/**
 * A ready-made route: the stops of a city (a hotel of the catalog and its nights), the transfers between
 * the arrival place, the stops and the departure place, and the leisure of the days. The route page
 * builds the door-to-door plan from it and the user's edits (start date, nights, transfer modes), which
 * live in the address (`?start=…&nights=3,2&t=0:taxi,2:walk,3:none`).
 */

export const PERSONAS = ['student', 'luxury', 'workation', 'culture'] as const
export type Persona = (typeof PERSONAS)[number]

export const PERSONA_LABEL: Record<Persona, string> = {
  student: 'Студент',
  luxury: 'Люкс',
  workation: 'Работа и отдых',
  culture: 'Культурный отпуск',
}

export const TRANSFER_MODES = ['transfer', 'taxi', 'car', 'walk'] as const
export type TransferMode = (typeof TRANSFER_MODES)[number]
/** A transfer of the plan: a mode, or `none` once the user removed it. */
export type TransferChoice = TransferMode | 'none'

export const TRANSFER_LABEL: Record<TransferMode, string> = {
  transfer: 'Трансфер',
  taxi: 'Такси',
  car: 'Аренда машины',
  walk: 'Пешком',
}

/** Prices of the modes, ₽: a fixed part and a part per kilometre; the car is rented for the whole stay instead. */
const FARE: Record<'transfer' | 'taxi', { base: number; perKm: number }> = {
  transfer: { base: 1500, perKm: 60 },
  taxi: { base: 800, perKm: 45 },
}
export const CAR_RENTAL_PER_DAY = 3500
/** On foot: 12 minutes a kilometre. */
const WALK_MINUTES_PER_KM = 12

export const EDITOR_NAME = 'Редакция О!Погнали'

/** Minutes the plan gives an arrival, a check-in, a check-out and a departure. */
const MOMENT_MINUTES = 30
const DEFAULT_LEISURE_MINUTES = 120
/** The start date is at most this many days ahead. */
const MAX_START_DAYS = 365

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const place = z.object({ name: z.string().min(1), lat: z.number(), lon: z.number(), time })

const routeSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    persona: z.enum(PERSONAS),
    destinationId: z.string().min(1),
    title: z.string().min(1),
    author: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('editor') }),
      z.object({ kind: z.literal('person'), name: z.string().min(1) }),
    ]),
    description: z.string(),
    cover: z.object({ id: z.string(), caption: z.string(), tone: z.number().int().nonnegative() }),
    /** Where the trip begins and ends (an airport or a station) and the time of arrival and departure. */
    arrival: place,
    departure: place,
    stops: z.array(z.object({ hotelId: z.string().min(1), nights: z.number().int().min(1).max(MAX_NIGHTS) })).min(1),
    /** The mode of each leg: arrival → stop 1, stop 1 → stop 2, …, last stop → departure. */
    transfers: z.array(z.enum(TRANSFER_MODES)),
    leisure: z.array(
      z.object({
        title: z.string().min(1),
        category: z.string().min(1),
        /** Day of the trip, 1 is the arrival day. */
        day: z.number().int().min(1),
        time,
        minutes: z.number().int().positive().optional(),
        /** ₽, 0 for a free one. */
        price: z.number().int().nonnegative(),
      }),
    ),
  })
  .refine((route) => route.transfers.length === route.stops.length + 1, {
    message: 'transfers: one per leg, stops + 1',
    path: ['transfers'],
  })

export type Route = z.infer<typeof routeSchema>
export type RouteLeisure = Route['leisure'][number]

/** The route of a database row; throws when it is malformed or a stop's hotel is not in the catalog. */
export function parseRoute(data: unknown, hasHotel: (id: string) => boolean): Route {
  const result = routeSchema.safeParse(data)
  if (!result.success) throw new Error(`Маршрут не прошёл проверку: ${z.prettifyError(result.error)}`)
  const route = result.data
  const unknown = route.stops.find((stop) => !hasHotel(stop.hotelId))
  if (unknown) throw new Error(`Маршрут ${route.id}: отеля ${unknown.hotelId} нет в каталоге`)
  return route
}

export const authorName = (route: Pick<Route, 'author'>) =>
  route.author.kind === 'editor' ? EDITOR_NAME : route.author.name

// ---------------------------------------------------------------------------------------------
// The user's edits

export interface RouteState {
  start: IsoDate
  nights: number[]
  transfers: TransferChoice[]
}

export const defaultStart = (today: IsoDate) => addDays(today, 1)

export const defaultState = (route: Route, today: IsoDate): RouteState => ({
  start: defaultStart(today),
  nights: route.stops.map((stop) => stop.nights),
  transfers: [...route.transfers],
})

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && toIso(fromIso(value)) === value
const CHOICES: readonly string[] = [...TRANSFER_MODES, 'none']

/** The edits of the address over the route's defaults; a malformed value keeps its default. */
export function parseRouteState(route: Route, params: Pick<URLSearchParams, 'get'>, today: IsoDate): RouteState {
  const state = defaultState(route, today)
  const start = params.get('start')
  if (start && isIsoDate(start) && start >= today && nightsBetween(today, start) <= MAX_START_DAYS) state.start = start
  params
    .get('nights')
    ?.split(',')
    .forEach((value, i) => {
      const nights = Number(value)
      if (i < state.nights.length && /^\d+$/.test(value) && nights >= 1 && nights <= MAX_NIGHTS)
        state.nights[i] = nights
    })
  for (const entry of params.get('t')?.split(',') ?? []) {
    const [leg, mode] = entry.split(':')
    const i = Number(leg)
    if (/^\d+$/.test(leg) && i < state.transfers.length && CHOICES.includes(mode))
      state.transfers[i] = mode as TransferChoice
  }
  return state
}

/** The address of the edits: the start date, and the nights and transfers only when they differ from the route's. */
export function toRouteParams(route: Route, state: RouteState): URLSearchParams {
  const params = new URLSearchParams({ start: state.start })
  if (state.nights.some((nights, i) => nights !== route.stops[i].nights)) params.set('nights', state.nights.join(','))
  const changed = state.transfers.flatMap((mode, i) => (mode === route.transfers[i] ? [] : `${i}:${mode}`))
  if (changed.length) params.set('t', changed.join(','))
  return params
}

// ---------------------------------------------------------------------------------------------
// The plan

/** Great-circle distance, km, to a tenth. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 10) / 10
}

/** Minutes on the way: by car as `travelTimes` (3 a kilometre, at least 1), on foot 12 a kilometre. */
export const legMinutes = (mode: TransferMode, km: number) =>
  mode === 'walk'
    ? Math.max(1, Math.ceil(Math.round(km * WALK_MINUTES_PER_KM * 10) / 10))
    : travelTimes({ distanceKm: km, metro: null }).centre

/** Price of a leg, ₽; a rented car and walking cost nothing per leg. */
export const legPrice = (mode: TransferMode, km: number) =>
  mode === 'transfer' || mode === 'taxi' ? Math.round(FARE[mode].base + FARE[mode].perKm * km) : 0

interface Moment {
  date: IsoDate
  /** Minutes from midnight. */
  start: number
  minutes: number
}

export type PlanItem = Moment &
  (
    | { kind: 'arrival'; place: string }
    | { kind: 'departure'; place: string }
    | { kind: 'check-in' | 'check-out'; stop: number; hotel: Hotel }
    | { kind: 'transfer'; leg: number; mode: TransferMode; from: string; to: string; km: number; price: number }
    | { kind: 'leisure'; index: number; leisure: RouteLeisure }
  )

export interface PlanStay {
  stop: number
  hotel: Hotel
  checkIn: IsoDate
  checkOut: IsoDate
  nights: number
  /** The cheapest rate for the nights, one room, weekend nights dearer, ₽. */
  price: number
}

export interface PlanDay {
  /** 1 is the arrival day. */
  day: number
  date: IsoDate
  items: PlanItem[]
}

export interface RoutePlan {
  start: IsoDate
  end: IsoDate
  nights: number
  stays: PlanStay[]
  days: PlanDay[]
  /** The rented car for the whole stay when any leg goes by car. */
  carRental: { days: number; price: number } | null
  /** Main costs: the hotels, the transfers and the rented car, ₽. */
  main: number
  /** Extra services: the leisure, ₽; not part of `main`. */
  extras: number
}

export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
export const formatTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** The door-to-door plan of the route with the edits: stays, transfers, leisure by day, and the two totals. */
export function buildPlan(route: Route, hotels: Readonly<Record<string, Hotel>>, state: RouteState): RoutePlan {
  const items: PlanItem[] = []
  const stays: PlanStay[] = []
  let date = state.start
  route.stops.forEach((stop, i) => {
    const hotel = hotels[stop.hotelId]
    const checkOut = addDays(date, state.nights[i])
    const rate = cheapestRate(hotel).rate.pricePerNight
    stays.push({
      stop: i,
      hotel,
      checkIn: date,
      checkOut,
      nights: state.nights[i],
      price: stayTotal(rate, date, checkOut, 1),
    })
    date = checkOut
  })
  const end = date

  const ends = [route.arrival, ...stays.map(({ hotel }) => hotel), route.departure]
  items.push({
    kind: 'arrival',
    place: route.arrival.name,
    date: state.start,
    start: toMinutes(route.arrival.time),
    minutes: MOMENT_MINUTES,
  })
  // Each leg leaves after the arrival or the check-out before it; a check-in waits for the hotel's hour.
  let ready = toMinutes(route.arrival.time) + MOMENT_MINUTES
  state.transfers.forEach((mode, leg) => {
    const legDate = leg === 0 ? state.start : stays[leg - 1].checkOut
    if (leg > 0) {
      const stay = stays[leg - 1]
      const start = toMinutes(stay.hotel.checkOutTime)
      items.push({
        kind: 'check-out',
        stop: stay.stop,
        hotel: stay.hotel,
        date: legDate,
        start,
        minutes: MOMENT_MINUTES,
      })
      ready = start + MOMENT_MINUTES
    }
    if (mode !== 'none') {
      const km = distanceKm(ends[leg], ends[leg + 1])
      const minutes = legMinutes(mode, km)
      items.push({
        kind: 'transfer',
        leg,
        mode,
        from: ends[leg].name,
        to: ends[leg + 1].name,
        km,
        price: legPrice(mode, km),
        date: legDate,
        start: ready,
        minutes,
      })
      ready += minutes
    }
    if (leg < stays.length) {
      const stay = stays[leg]
      const start = Math.max(ready, toMinutes(stay.hotel.checkInTime))
      items.push({
        kind: 'check-in',
        stop: stay.stop,
        hotel: stay.hotel,
        date: legDate,
        start,
        minutes: MOMENT_MINUTES,
      })
    }
  })
  items.push({
    kind: 'departure',
    place: route.departure.name,
    date: end,
    start: Math.max(ready, toMinutes(route.departure.time)),
    minutes: MOMENT_MINUTES,
  })

  const nights = nightsBetween(state.start, end)
  // Leisure of a day past the trip's last day (after fewer nights) drops out of the plan.
  route.leisure.forEach((leisure, index) => {
    if (leisure.day <= nights + 1)
      items.push({
        kind: 'leisure',
        index,
        leisure,
        date: addDays(state.start, leisure.day - 1),
        start: toMinutes(leisure.time),
        minutes: leisure.minutes ?? DEFAULT_LEISURE_MINUTES,
      })
  })

  const days: PlanDay[] = Array.from({ length: nights + 1 }, (_, i) => ({
    day: i + 1,
    date: addDays(state.start, i),
    items: [],
  }))
  for (const item of items) days[nightsBetween(state.start, item.date)].items.push(item)
  // Stable: a leg and the check-in it leads to keep their order at the same minute.
  for (const day of days) day.items.sort((a, b) => a.start - b.start)

  const carRental = state.transfers.includes('car') ? { days: nights, price: CAR_RENTAL_PER_DAY * nights } : null
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
  const main =
    sum(stays.map((stay) => stay.price)) +
    sum(items.map((item) => (item.kind === 'transfer' ? item.price : 0))) +
    (carRental?.price ?? 0)
  const extras = sum(items.map((item) => (item.kind === 'leisure' ? item.leisure.price : 0)))
  return { start: state.start, end, nights, stays, days, carRental, main, extras }
}

// ---------------------------------------------------------------------------------------------
// Calendar export

/** Stable across edits: the same item keeps its key, so a re-imported plan updates its events. */
export function itemKey(item: PlanItem): string {
  switch (item.kind) {
    case 'arrival':
    case 'departure':
      return item.kind
    case 'check-in':
    case 'check-out':
      return `${item.kind}-${item.stop}`
    case 'transfer':
      return `transfer-${item.leg}`
    case 'leisure':
      return `leisure-${item.index}`
  }
}

/** What an item is called in the plan and in the calendar. */
export function itemTitle(item: PlanItem): string {
  switch (item.kind) {
    case 'arrival':
      return `Прибытие: ${item.place}`
    case 'departure':
      return `Отъезд: ${item.place}`
    case 'check-in':
      return `Заезд: ${item.hotel.name}`
    case 'check-out':
      return `Выезд: ${item.hotel.name}`
    case 'transfer':
      return `${TRANSFER_LABEL[item.mode]}: ${item.from} → ${item.to}`
    case 'leisure':
      return item.leisure.title
  }
}

/** The plan's events for `toIcs`: arrival, check-ins and check-outs, transfers, leisure and departure. */
export function planEvents(route: Route, plan: RoutePlan): CalendarEvent[] {
  return plan.days.flatMap((day) =>
    day.items.map((item): CalendarEvent => {
      const event: CalendarEvent = {
        uid: `${route.id}-${itemKey(item)}@opognali`,
        date: item.date,
        start: item.start,
        minutes: item.minutes,
        summary: itemTitle(item),
      }
      if (item.kind === 'check-in' || item.kind === 'check-out') event.location = item.hotel.address
      if (item.kind === 'transfer')
        event.description = `${item.km.toString().replace('.', ',')} км, ${item.minutes} мин${
          item.mode === 'car' ? ', аренда машины' : item.price ? `, ${item.price} ₽` : ''
        }`
      if (item.kind === 'leisure')
        event.description = `${item.leisure.category}${item.leisure.price ? `, ${item.leisure.price} ₽` : ''}`
      return event
    }),
  )
}
