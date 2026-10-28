import type { Destination } from '../data/destinations'
import { PARTY_GUESTS, VIBE_LABEL, type Brief } from './assistant'
import { VIEW_LABEL } from './features'
import { countRu, formatMeters, formatPrice } from './format'
import { fromIso } from './dates'
import type { Guests } from './search'

/**
 * Эвал's memory of the session is the chat's brief: what it has saved of the trip. These are its lines for the feed —
 * «Сохранил в память сессии: Даты: 25–30 нояб.» after a turn that changed it, and the parameters of «ничего не
 * нашёл», each one edited in place. Only what the brief has: nothing is filled in.
 */

export type ParamKey =
  | 'dates'
  | 'when'
  | 'nights'
  | 'guests'
  | 'rooms'
  | 'city'
  | 'vibe'
  | 'mood'
  | 'budget'
  | 'sea'
  | 'quiet'
  | 'height'
  | 'view'

export interface SessionParam {
  key: ParamKey
  /** «Даты», «Расстояние до моря». */
  label: string
  /** «25–30 нояб.», «до 1 км»; «не важно» for a parameter taken away. */
  value: string
}

const MONTH_IN = [
  'январе',
  'феврале',
  'марте',
  'апреле',
  'мае',
  'июне',
  'июле',
  'августе',
  'сентябре',
  'октябре',
  'ноябре',
  'декабре',
]

const shortDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })

/** «25–30 нояб.», «30 нояб. – 2 дек.». */
export function stayLabel(checkIn: string, checkOut: string): string {
  const [a, b] = [fromIso(checkIn), fromIso(checkOut)]
  return checkIn.slice(0, 7) === checkOut.slice(0, 7)
    ? `${a.getDate()}–${shortDay.format(b)}`
    : `${shortDay.format(a)} – ${shortDay.format(b)}`
}

/** «1 взрослый», «2 взрослых, 1 ребёнок». */
export const peopleLabel = ({ adults, children }: Guests) =>
  [
    countRu(adults, ['взрослый', 'взрослых', 'взрослых']),
    children > 0 && countRu(children, ['ребёнок', 'ребёнка', 'детей']),
  ]
    .filter(Boolean)
    .join(', ')

export const roomsLabel = (rooms: number) => countRu(rooms, ['номер', 'номера', 'номеров'])

/** The guests the brief has: set by hand, or the party's; none for a party left open. */
export const briefGuestsOf = (brief: Brief): Guests | undefined =>
  brief.guests ?? (brief.party && brief.party !== 'any' ? PARTY_GUESTS[brief.party] : undefined)

/** The parameters the brief has, in the order of the card. */
export function sessionParams(brief: Brief, destinations: readonly Destination[]): SessionParam[] {
  const params: SessionParam[] = []
  const add = (key: ParamKey, label: string, value: string | false | 0 | undefined | null) => {
    if (value) params.push({ key, label, value })
  }
  if (brief.dates) add('dates', 'Даты', stayLabel(brief.dates.checkIn, brief.dates.checkOut))
  else {
    add(
      'when',
      'Когда',
      typeof brief.when === 'number' ? `в ${MONTH_IN[brief.when]}` : brief.when === 'soon' && 'в ближайшее время',
    )
    add('nights', 'Длительность', brief.nights && countRu(brief.nights, ['ночь', 'ночи', 'ночей']))
  }
  const guests = briefGuestsOf(brief)
  add('guests', 'Гости', guests && peopleLabel(guests))
  add('rooms', 'Номера', guests && roomsLabel(guests.rooms))
  add('city', 'Город', destinations.find((d) => d.id === brief.destinationId)?.name)
  add('vibe', 'Тема', brief.vibe && brief.vibe !== 'any' && VIBE_LABEL[brief.vibe])
  add('mood', 'Настроение', brief.mood && (brief.mood === 'calm' ? 'спокойно' : 'активно'))
  add(
    'budget',
    'Бюджет',
    brief.budget
      ? `до ${formatPrice(brief.budget)}`
      : brief.budgetPerNight && `до ${formatPrice(brief.budgetPerNight)} за ночь`,
  )
  add('sea', 'Расстояние до моря', brief.seaMaxM && `до ${formatMeters(brief.seaMaxM)}`)
  add('quiet', 'Тишина', brief.quiet && 'тихо ночью')
  add('height', 'Здание', brief.height && (brief.height === 'high' ? 'повыше' : 'пониже'))
  add('view', 'Вид из окна', brief.view && (brief.view === 'any' ? 'любой' : VIEW_LABEL[brief.view]))
  return params
}

/** «не важно»: the value of a parameter the change took away. */
export const REMOVED = 'не важно'

/**
 * What a change of the brief saved: the parameters that are new or different, and the ones taken away («не важно»);
 * the month and the nights of named days are a part of the dates. Empty when nothing changed.
 */
export function savedParams(before: Brief, after: Brief, destinations: readonly Destination[]): SessionParam[] {
  const old = new Map(sessionParams(before, destinations).map((p) => [p.key, p]))
  const next = sessionParams(after, destinations)
  const keys = new Set(next.map((p) => p.key))
  const changed = next.filter((p) => old.get(p.key)?.value !== p.value)
  // The month and the nights give way to the named days: not a parameter taken away.
  const replaced = (key: ParamKey) => (key === 'when' || key === 'nights') && keys.has('dates')
  const removed = [...old.values()]
    .filter((p) => !keys.has(p.key) && !replaced(p.key))
    .map((p) => ({ ...p, value: REMOVED }))
  return [...changed, ...removed]
}

/** «Даты: 25–30 нояб.» */
export const paramLine = ({ label, value }: SessionParam) => `${label}: ${value}`

const KEYS: readonly ParamKey[] = [
  'dates',
  'when',
  'nights',
  'guests',
  'rooms',
  'city',
  'vibe',
  'mood',
  'budget',
  'sea',
  'quiet',
  'height',
  'view',
]

/** The parameters of a stored message; a damaged one reads as none. */
export function parseParams(value: unknown): SessionParam[] | undefined {
  if (!Array.isArray(value)) return undefined
  const params = value.filter(
    (p): p is SessionParam =>
      typeof p === 'object' &&
      p !== null &&
      KEYS.includes((p as SessionParam).key) &&
      typeof (p as SessionParam).label === 'string' &&
      typeof (p as SessionParam).value === 'string',
  )
  return params.length > 0 ? params.map(({ key, label, value }) => ({ key, label, value })) : undefined
}
