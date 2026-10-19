import { destinations, scenarios, type Destination, type Scenario, type ScenarioId } from '../data/destinations'
import { addDays, fromIso, nightsBetween, toIso, type IsoDate } from './dates'

export const GUEST_LIMITS = {
  adults: { min: 1, max: 10 },
  children: { min: 0, max: 6 },
  rooms: { min: 1, max: 5 },
} as const

export const MAX_NIGHTS = 30

export const DEFAULT_GUESTS: Guests = { adults: 2, children: 0, rooms: 1 }

export interface Guests {
  adults: number
  children: number
  rooms: number
}

export interface SearchQuery {
  /** Raw text of the destination field. */
  destination: string
  checkIn: IsoDate
  checkOut: IsoDate
  guests: Guests
}

/** What the destination text refers to: a single place or a travel scenario. */
export type SearchTarget =
  { kind: 'destination'; destination: Destination } | { kind: 'scenario'; scenario: ScenarioId; title: string }

export type SearchErrors = Partial<Record<'destination' | 'dates' | 'guests', string>>

/** Empty dates default to tomorrow and the night after. Nothing is filled until `today` is known. */
export function withStartDates(query: SearchQuery, today: IsoDate): SearchQuery {
  if (!today) return query
  const checkIn = query.checkIn || addDays(today, 1)
  return { ...query, checkIn, checkOut: query.checkOut || addDays(checkIn, 1) }
}

const normalize = (s: string) => s.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е')

export function findScenario(text: string): Scenario | undefined {
  const q = normalize(text)
  return q ? scenarios.find((s) => normalize(s.title) === q) : undefined
}

export function resolveTarget(text: string): SearchTarget | null {
  const q = normalize(text)
  if (!q) return null
  const destination = destinations.find((d) => normalize(d.name) === q)
  if (destination) return { kind: 'destination', destination }
  const scenario = findScenario(q)
  if (scenario) return { kind: 'scenario', scenario: scenario.id, title: scenario.title }
  return null
}

export function suggestDestinations(text: string, limit = 6): Destination[] {
  const q = normalize(text)
  if (!q) return destinations.filter((d) => d.onGlobe).slice(0, limit)
  const scenario = findScenario(q)
  if (scenario) return destinations.filter((d) => d.scenarios.includes(scenario.id)).slice(0, limit)
  const starts = destinations.filter((d) => normalize(d.name).startsWith(q) || normalize(d.country).startsWith(q))
  const contains = destinations.filter(
    (d) => !starts.includes(d) && (normalize(d.name).includes(q) || normalize(d.country).includes(q)),
  )
  return [...starts, ...contains].slice(0, limit)
}

const inLimits = (n: number, { min, max }: { min: number; max: number }) => Number.isInteger(n) && n >= min && n <= max

export function validateSearch(query: SearchQuery, today: IsoDate): SearchErrors {
  const errors: SearchErrors = {}
  if (!query.destination.trim()) {
    errors.destination = 'Укажите, куда вы хотите поехать'
  } else if (!resolveTarget(query.destination)) {
    errors.destination = 'Выберите направление из списка подсказок'
  }

  const nights = nightsBetween(query.checkIn, query.checkOut)
  if (query.checkIn < today) errors.dates = 'Дата заезда уже прошла'
  else if (nights < 1) errors.dates = 'Дата выезда должна быть позже даты заезда'
  else if (nights > MAX_NIGHTS) errors.dates = `Максимальный срок проживания — ${MAX_NIGHTS} ночей`

  const { adults, children, rooms } = query.guests
  if (rooms > adults) errors.guests = 'В каждом номере должен быть хотя бы один взрослый'
  else if (
    !inLimits(adults, GUEST_LIMITS.adults) ||
    !inLimits(children, GUEST_LIMITS.children) ||
    !inLimits(rooms, GUEST_LIMITS.rooms)
  )
    errors.guests = 'Проверьте количество гостей'
  return errors
}

/** Dates and guests of a stay: shared by search and offer URLs. */
export type Stay = Pick<SearchQuery, 'checkIn' | 'checkOut' | 'guests'>

export function setStayParams(params: URLSearchParams, { checkIn, checkOut, guests }: Stay): URLSearchParams {
  params.set('checkin', checkIn)
  params.set('checkout', checkOut)
  params.set('adults', String(guests.adults))
  if (guests.children) params.set('children', String(guests.children))
  params.set('rooms', String(guests.rooms))
  return params
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const isIsoDate = (value: string | null): value is IsoDate =>
  value !== null && ISO_DATE.test(value) && toIso(fromIso(value)) === value
const toCount = (value: string | null) => (value !== null && /^\d+$/.test(value) ? Number(value) : NaN)

/**
 * Reads the stay written by `setStayParams`; `null` if the dates are missing or malformed.
 * Guest counts are read as is (a missing one is NaN): `validateSearch` judges them.
 */
export function parseStayParams(params: Pick<URLSearchParams, 'get'>): Stay | null {
  const checkIn = params.get('checkin')
  const checkOut = params.get('checkout')
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) return null
  const children = params.get('children')
  return {
    checkIn,
    checkOut,
    guests: {
      adults: toCount(params.get('adults')),
      children: children === null ? 0 : toCount(children),
      rooms: toCount(params.get('rooms')),
    },
  }
}

export function toSearchParams(query: SearchQuery, target: SearchTarget): URLSearchParams {
  const params = new URLSearchParams()
  if (target.kind === 'destination') params.set('destination', target.destination.id)
  else params.set('scenario', target.scenario)
  return setStayParams(params, query)
}

/**
 * The query written by `toSearchParams`, as the form holds it: the destination or scenario id
 * becomes its name, missing dates stay empty (see `withStartDates`) and guests default to
 * `DEFAULT_GUESTS` without dates. An unknown id becomes an empty destination; malformed guest
 * counts are kept (NaN) for `validateSearch` to report.
 */
export function fromSearchParams(params: Pick<URLSearchParams, 'get'>): SearchQuery {
  const destinationId = params.get('destination')
  const scenarioId = params.get('scenario')
  const destination = destinationId
    ? destinations.find((d) => d.id === destinationId)?.name
    : scenarios.find((s) => s.id === scenarioId)?.title
  const stay = parseStayParams(params)
  return {
    destination: destination ?? '',
    checkIn: stay?.checkIn ?? '',
    checkOut: stay?.checkOut ?? '',
    guests: stay?.guests ?? DEFAULT_GUESTS,
  }
}
