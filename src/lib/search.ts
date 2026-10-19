import { destinations, scenarios, type Destination, type Scenario, type ScenarioId } from '../data/destinations'
import { nightsBetween, type IsoDate } from './dates'

export const GUEST_LIMITS = {
  adults: { min: 1, max: 10 },
  children: { min: 0, max: 6 },
  rooms: { min: 1, max: 5 },
} as const

export const MAX_NIGHTS = 30

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

export function toSearchParams(query: SearchQuery, target: SearchTarget): URLSearchParams {
  const params = new URLSearchParams()
  if (target.kind === 'destination') params.set('destination', target.destination.id)
  else params.set('scenario', target.scenario)
  params.set('checkin', query.checkIn)
  params.set('checkout', query.checkOut)
  params.set('adults', String(query.guests.adults))
  if (query.guests.children) params.set('children', String(query.guests.children))
  params.set('rooms', String(query.guests.rooms))
  return params
}

export interface SearchResultItem {
  destination: Destination
  /** Demo estimate for the whole stay and all rooms, ₽. */
  totalFrom: number
}

export interface SearchResult {
  query: SearchQuery
  target: SearchTarget
  params: URLSearchParams
  nights: number
  items: SearchResultItem[]
}

/**
 * Demo search: there is no backend, so matches come from the local catalogue
 * and prices are rough "from" estimates. Nothing is booked.
 */
export async function runDemoSearch(
  query: SearchQuery,
  target: SearchTarget,
  signal?: AbortSignal,
): Promise<SearchResult> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 700)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
  const nights = nightsBetween(query.checkIn, query.checkOut)
  const matches =
    target.kind === 'destination'
      ? [target.destination]
      : destinations.filter((d) => d.scenarios.includes(target.scenario))
  return {
    query,
    target,
    params: toSearchParams(query, target),
    nights,
    items: matches
      .map((destination) => ({ destination, totalFrom: destination.priceFrom * nights * query.guests.rooms }))
      .sort((a, b) => a.totalFrom - b.totalFrom),
  }
}
