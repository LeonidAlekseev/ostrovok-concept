import { scenarios, type Destination, type Scenario, type ScenarioId } from '../data/destinations'
import { isVisibleHotel } from './catalog'
import { addDays, fromIso, nightsBetween, toIso, type IsoDate } from './dates'
import { zodiac } from './horoscope'
import { archetypeName } from './vibe'

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

/** The stay of a link without a search: tomorrow and the day after, default guests. `null` until `today` is known. */
export function startStay(today: IsoDate): Stay | null {
  if (!today) return null
  const { checkIn, checkOut, guests } = withStartDates(
    { destination: '', checkIn: '', checkOut: '', guests: DEFAULT_GUESTS },
    today,
  )
  return { checkIn, checkOut, guests }
}

export const normalize = (s: string) => s.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е')

/** The scenario named by `text`, if one of `destinations` has it: production hides those of no city shown. */
export function findScenario(text: string, destinations: readonly Destination[]): Scenario | undefined {
  const q = normalize(text)
  return q ? scenarios.find((s) => normalize(s.title) === q && hasScenario(s.id, destinations)) : undefined
}

const hasScenario = (id: ScenarioId, destinations: readonly Destination[]) =>
  destinations.some((d) => d.scenarios.includes(id))

export function resolveTarget(text: string, destinations: readonly Destination[]): SearchTarget | null {
  const q = normalize(text)
  if (!q) return null
  const destination = destinations.find((d) => normalize(d.name) === q)
  if (destination) return { kind: 'destination', destination }
  const scenario = findScenario(q, destinations)
  if (scenario) return { kind: 'scenario', scenario: scenario.id, title: scenario.title }
  return null
}

export function suggestDestinations(text: string, destinations: readonly Destination[], limit = 6): Destination[] {
  const q = normalize(text)
  if (!q) return destinations.filter((d) => d.onGlobe).slice(0, limit)
  const scenario = findScenario(q, destinations)
  if (scenario) return destinations.filter((d) => d.scenarios.includes(scenario.id)).slice(0, limit)
  const starts = destinations.filter((d) => normalize(d.name).startsWith(q) || normalize(d.country).startsWith(q))
  const contains = destinations.filter(
    (d) => !starts.includes(d) && (normalize(d.name).includes(q) || normalize(d.country).includes(q)),
  )
  return [...starts, ...contains].slice(0, limit)
}

const inLimits = (n: number, { min, max }: { min: number; max: number }) => Number.isInteger(n) && n >= min && n <= max

export function validateSearch(query: SearchQuery, today: IsoDate, destinations: readonly Destination[]): SearchErrors {
  const errors: SearchErrors = {}
  if (!query.destination.trim()) {
    errors.destination = 'Укажите, куда вы хотите поехать'
  } else if (!resolveTarget(query.destination, destinations)) {
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

export function setGuestParams(params: URLSearchParams, guests: Guests): URLSearchParams {
  params.set('adults', String(guests.adults))
  if (guests.children) params.set('children', String(guests.children))
  else params.delete('children')
  params.set('rooms', String(guests.rooms))
  return params
}

export function setStayParams(params: URLSearchParams, { checkIn, checkOut, guests }: Stay): URLSearchParams {
  params.set('checkin', checkIn)
  params.set('checkout', checkOut)
  return setGuestParams(params, guests)
}

/** The hotel page with the dates of `stay`; without them, for two adults in one room, and the page asks for dates. */
export const hotelHref = (hotelId: string, stay?: Stay | null) =>
  `/hotels/${hotelId}?${stay ? setStayParams(new URLSearchParams(), stay) : setGuestParams(new URLSearchParams(), DEFAULT_GUESTS)}`

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const isIsoDate = (value: string | null): value is IsoDate =>
  value !== null && ISO_DATE.test(value) && toIso(fromIso(value)) === value
const toCount = (value: string | null) => (value !== null && /^\d+$/.test(value) ? Number(value) : NaN)

/**
 * Reads the guests written by `setStayParams`, whatever the dates; `null` if the address has none.
 * Counts are read as is (a missing one is NaN): `validateSearch` judges them.
 */
export function parseGuestParams(params: Pick<URLSearchParams, 'get'>): Guests | null {
  const adults = params.get('adults')
  const children = params.get('children')
  const rooms = params.get('rooms')
  if (adults === null && children === null && rooms === null) return null
  return {
    adults: toCount(adults),
    children: children === null ? 0 : toCount(children),
    rooms: toCount(rooms),
  }
}

/**
 * Reads the stay written by `setStayParams`; `null` if the dates are missing or malformed.
 * Guest counts are read by `parseGuestParams` (none at all means NaN, for `validateSearch` to report).
 */
export function parseStayParams(params: Pick<URLSearchParams, 'get'>): Stay | null {
  const checkIn = params.get('checkin')
  const checkOut = params.get('checkout')
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) return null
  return { checkIn, checkOut, guests: parseGuestParams(params) ?? { adults: NaN, children: 0, rooms: NaN } }
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
export function fromSearchParams(
  params: Pick<URLSearchParams, 'get'>,
  destinations: readonly Destination[],
): SearchQuery {
  const destinationId = params.get('destination')
  const scenarioId = params.get('scenario')
  const destination = destinationId
    ? destinations.find((d) => d.id === destinationId)?.name
    : scenarios.find((s) => s.id === scenarioId && hasScenario(s.id, destinations))?.title
  const stay = parseStayParams(params)
  return {
    destination: destination ?? '',
    checkIn: stay?.checkIn ?? '',
    checkOut: stay?.checkOut ?? '',
    guests: stay?.guests ?? DEFAULT_GUESTS,
  }
}

// ---------------------------------------------------------------------------------------------
// Selections: the hotels a vibe, the stars or a drawing picked, on /search

/** Where a selection comes from: «Это твой вайб», «Звёзды подскажут», «Нарисуй свой отдых», Эвал's answer. */
export type SelectionSource = 'vibe' | 'stars' | 'draw' | 'assistant'

/** The hotels of a selection; `from` and `pick` name its source and what it picked (an archetype, a sign). */
export interface SelectionLink {
  hotels: readonly string[]
  from: SelectionSource
  /** The archetype of a vibe or a drawing, the sign of the stars. */
  pick: string
}

/** The selection of an address, as /search shows it: the hotels to load and the title. */
export interface Selection {
  kind: 'selection'
  hotels: string[]
  title: string
}

/** As many hotels as `GET /api/hotels?ids=` loads at once. */
const MAX_SELECTION = 60
const HOTEL_ID = /^[a-z0-9-]{1,80}$/

const SELECTION_TITLES: Record<SelectionSource, (pick: string) => string | undefined> = {
  vibe: (pick) => {
    const name = archetypeName(pick)
    return name && `Подборка по вашему вайбу: ${name}`
  },
  stars: (pick) => {
    const sign = zodiac.find((z) => z.id === pick)
    return sign && `Подборка звёзд для ${sign.genitive}`
  },
  draw: (pick) => {
    const name = archetypeName(pick)
    return name && `Подборка по вашему рисунку: ${name}`
  },
  assistant: () => 'Подборка Эвала',
}

/** The /search address of a selection; without `stay` the page starts from tomorrow, as a link without dates. */
export function selectionHref({ hotels, from, pick }: SelectionLink, stay: Stay | null): string {
  // The ids are of `HOTEL_ID`: the commas stay as they are, not %2C.
  const params = new URLSearchParams({ from, pick })
  if (stay) setStayParams(params, stay)
  return `/search?hotels=${hotels.join(',')}&${params}`
}

/**
 * The selection written by `selectionHref`, `null` without `hotels`. Malformed, repeated and hidden
 * (`isVisibleHotel`) ids are skipped; an unknown `from` or `pick` gives the title «Подобранные отели».
 */
export function parseSelection(params: Pick<URLSearchParams, 'get'>): Selection | null {
  const list = params.get('hotels')
  if (list === null) return null
  const hotels = [...new Set(list.split(','))]
    .filter((id) => HOTEL_ID.test(id) && isVisibleHotel({ id }))
    .slice(0, MAX_SELECTION)
  const from = params.get('from')
  const pick = params.get('pick') ?? ''
  const title = from && Object.hasOwn(SELECTION_TITLES, from) ? SELECTION_TITLES[from as SelectionSource](pick) : null
  return { kind: 'selection', hotels, title: title ?? 'Подобранные отели' }
}
