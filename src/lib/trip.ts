import { z } from 'zod'
import { cheapestRate, type Hotel } from './catalog'
import { fromIso, toIso, type IsoDate } from './dates'
import type { CalendarEvent } from './ics'
import { stayTotal } from './offer'
import {
  buildPlan,
  defaultStart,
  parseRoute,
  planEvents,
  toMinutes,
  TRANSFER_MODES,
  type Route,
  type RouteLeisure,
  type RoutePlan,
  type RouteState,
  type TransferChoice,
} from './routes'
import { MAX_NIGHTS } from './search'

/**
 * A trip plan: the user's copy of a ready-made route («Повторить маршрут»). It keeps the snapshot of the route
 * as it was copied and the user's edits over it: the start date, the hotel and nights of each stop, the
 * transfer of each leg (or none) and the leisure — its order, day and time. The plan, prices and calendar
 * come from `buildPlan` of src/lib/routes.ts; a later change of the route never changes the copy.
 */

export type TripLeisure = RouteLeisure & { id: string }

/** What the user changes; saved as a whole. */
export interface TripEdits {
  start: IsoDate
  stops: { hotelId: string; nights: number }[]
  /** One per leg, as in `Route.transfers`; `none` once removed from the plan. */
  transfers: TransferChoice[]
  leisure: TripLeisure[]
}

export interface TripData extends TripEdits {
  /** The route as it was copied. */
  route: Route
}

export const tripPath = (id: string) => `/trip/${id}`
/** Makes the copy of a route and opens it; a guest signs in first and comes back. */
export const newTripPath = (routeId: string) => `/trip/new?route=${encodeURIComponent(routeId)}`

export const ALTERNATIVES_ERROR = 'Не получилось предложить, попробуйте ещё раз'

/** A plan holds at most this much leisure. */
export const MAX_LEISURE = 60
/** The leisure of the alternatives: what the model may suggest and the user may pick. */
export const leisureFields = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  minutes: z.number().int().min(15).max(720),
  price: z.number().int().min(0).max(1_000_000),
})
export type LeisureFields = z.infer<typeof leisureFields>

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => toIso(fromIso(value)) === value, 'not a date')
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

/** A leisure item of a plan. */
export const leisureItem = leisureFields.extend({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  minutes: leisureFields.shape.minutes.optional(),
  day: z.number().int().min(1),
  time,
})

const editsSchema = z.object({
  start: isoDate,
  stops: z
    .array(
      z.object({ hotelId: z.string().regex(/^[a-z0-9-]{1,80}$/), nights: z.number().int().min(1).max(MAX_NIGHTS) }),
    )
    .min(1),
  transfers: z.array(z.enum([...TRANSFER_MODES, 'none'])),
  leisure: z.array(leisureItem).max(MAX_LEISURE),
})

/** The edits of a request over the plan's route; throws when they do not fit it. */
export function parseEdits(data: unknown, route: Route): TripEdits {
  const result = editsSchema.safeParse(data)
  if (!result.success) throw new Error(`План не прошёл проверку: ${z.prettifyError(result.error)}`)
  const edits = result.data
  if (edits.stops.length !== route.stops.length) throw new Error('План не прошёл проверку: другое число точек')
  if (edits.transfers.length !== route.stops.length + 1)
    throw new Error('План не прошёл проверку: трансферы — по одному на отрезок')
  if (new Set(edits.leisure.map((item) => item.id)).size !== edits.leisure.length)
    throw new Error('План не прошёл проверку: повтор id досуга')
  const lastDay = route.stops.length * MAX_NIGHTS + 1
  if (edits.leisure.some((item) => item.day > lastDay)) throw new Error('План не прошёл проверку: день досуга')
  return edits
}

/** The plan of a database row; throws when it is malformed. */
export function parseTrip(data: unknown): TripData {
  const record = z.object({ route: z.unknown() }).loose().parse(data)
  const route = parseRoute(record.route, () => true)
  return { route, ...parseEdits(record, route) }
}

/** The edits alone: what the page sends to be saved. */
export const tripEdits = ({ start, stops, transfers, leisure }: TripData): TripEdits => ({
  start,
  stops,
  transfers,
  leisure,
})

/** The copy of a route: its own nights, transfers and leisure, from tomorrow. */
export const copyRoute = (route: Route, today: IsoDate): TripData => ({
  route,
  start: defaultStart(today),
  stops: route.stops.map((stop) => ({ ...stop })),
  transfers: [...route.transfers],
  leisure: route.leisure.map((item, i) => ({ ...item, id: `l${i + 1}` })),
})

/** The route with the plan's stops and leisure, for `buildPlan` and the calendar; `id` names the events. */
export const tripRoute = (trip: TripData, id = trip.route.id): Route => ({
  ...trip.route,
  id,
  stops: trip.stops,
  leisure: trip.leisure,
})

export const tripState = (trip: TripData): RouteState => ({
  start: trip.start,
  nights: trip.stops.map((stop) => stop.nights),
  transfers: trip.transfers,
})

/** The door-to-door plan with real dates and prices: the hotels of the stops must be in `hotels`. */
export const tripPlan = (trip: TripData, hotels: Readonly<Record<string, Hotel>>): RoutePlan =>
  buildPlan(tripRoute(trip), hotels, tripState(trip))

/** The calendar events of the plan; their ids are the plan's, so a re-imported plan updates its events. */
export const tripEvents = (tripId: string, trip: TripData, plan: RoutePlan): CalendarEvent[] =>
  planEvents(tripRoute(trip, `trip-${tripId}`), plan)

/** Days of the trip: the arrival day and a day after each night. */
export const tripDays = (trip: Pick<TripData, 'stops'>) =>
  trip.stops.reduce((total, stop) => total + stop.nights, 0) + 1

/** The price of a hotel for the nights of a stop, as in the plan: the cheapest rate, one room. */
export const stayPrice = (hotel: Hotel, checkIn: IsoDate, checkOut: IsoDate) =>
  stayTotal(cheapestRate(hotel).rate.pricePerNight, checkIn, checkOut, 1)

// ---------------------------------------------------------------------------------------------
// The edits

export const setStart = (trip: TripData, start: IsoDate): TripData => ({ ...trip, start })

export const setNights = (trip: TripData, stop: number, nights: number): TripData => ({
  ...trip,
  stops: trip.stops.map((s, i) => (i === stop ? { ...s, nights: Math.min(MAX_NIGHTS, Math.max(1, nights)) } : s)),
})

export const setTransfer = (trip: TripData, leg: number, choice: TransferChoice): TripData => ({
  ...trip,
  transfers: trip.transfers.map((t, i) => (i === leg ? choice : t)),
})

/** «Вернуть»: the leg goes back to the route's mode. */
export const restoreTransfer = (trip: TripData, leg: number): TripData =>
  setTransfer(trip, leg, trip.route.transfers[leg])

export const replaceHotel = (trip: TripData, stop: number, hotelId: string): TripData => ({
  ...trip,
  stops: trip.stops.map((s, i) => (i === stop ? { ...s, hotelId } : s)),
})

/** The leisure of a day in the plan's order: by time, then as listed (`buildPlan` sorts the same way). */
export const dayLeisure = (trip: TripData, day: number): TripLeisure[] =>
  trip.leisure.filter((item) => item.day === day).sort((a, b) => toMinutes(a.time) - toMinutes(b.time))

/**
 * Puts the day's leisure in `order`: the items take the day's times in turn, earliest first, and their slots
 * in the list, so the new order holds even for items at the same time.
 */
function reorderDay(trip: TripData, day: number, order: TripLeisure[]): TripData {
  const times = order.map((item) => item.time).sort((a, b) => toMinutes(a) - toMinutes(b))
  const placed = order.map((item, i) => ({ ...item, time: times[i] }))
  let next = 0
  return { ...trip, leisure: trip.leisure.map((item) => (item.day === day ? placed[next++] : item)) }
}

/** Moves a leisure item to the place of `targetId` in the same day (a drop), or one up or down (`±1`). */
export function moveLeisure(trip: TripData, id: string, to: string | -1 | 1): TripData {
  const item = trip.leisure.find((l) => l.id === id)
  if (!item) return trip
  const order = dayLeisure(trip, item.day)
  const from = order.findIndex((l) => l.id === id)
  const target = typeof to === 'string' ? order.findIndex((l) => l.id === to) : from + to
  if (target < 0 || target >= order.length || target === from) return trip
  order.splice(target, 0, ...order.splice(from, 1))
  return reorderDay(trip, item.day, order)
}

/** Another day for a leisure item: its time stays, so it takes its place there by time. */
export const moveLeisureToDay = (trip: TripData, id: string, day: number): TripData => ({
  ...trip,
  leisure: trip.leisure.map((item) =>
    item.id === id ? { ...item, day: Math.min(tripDays(trip), Math.max(1, day)) } : item,
  ),
})

export const setLeisureTime = (trip: TripData, id: string, value: string): TripData =>
  time.safeParse(value).success
    ? { ...trip, leisure: trip.leisure.map((item) => (item.id === id ? { ...item, time: value } : item)) }
    : trip

export const removeLeisure = (trip: TripData, id: string): TripData => ({
  ...trip,
  leisure: trip.leisure.filter((item) => item.id !== id),
})

/** An alternative in place of a leisure item: the same day and time, a new id for the new event. */
export function replaceLeisure(trip: TripData, id: string, fields: LeisureFields): TripData {
  const taken = new Set(trip.leisure.map((item) => item.id))
  let n = trip.leisure.length + 1
  while (taken.has(`l${n}`)) n += 1
  return {
    ...trip,
    leisure: trip.leisure.map((item) => (item.id === id ? { ...item, ...fields, id: `l${n}` } : item)),
  }
}

// ---------------------------------------------------------------------------------------------
// «Мои планы»

export interface TripSummary {
  id: string
  title: string
  city: string
  start: IsoDate
  end: IsoDate
  nights: number
  /** ₽: the main costs and, apart, the extra services. */
  main: number
  extras: number
}

export function summarizeTrip(
  id: string,
  trip: TripData,
  hotels: Readonly<Record<string, Hotel>>,
  city: string,
): TripSummary {
  const plan = tripPlan(trip, hotels)
  return {
    id,
    title: trip.route.title,
    city,
    start: plan.start,
    end: plan.end,
    nights: plan.nights,
    main: plan.main,
    extras: plan.extras,
  }
}
