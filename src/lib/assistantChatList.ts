import type { Destination } from '../data/destinations'
import { PARTY_GUESTS, type Brief, type Plan } from './assistant'
import type { Chat } from './assistantChats'
import { fromIso, nightsBetween, toIso, type IsoDate } from './dates'
import { countRu, guestsLabel } from './format'
import { selectionHref, type Guests } from './search'

/**
 * The list of chats on `/assistant`: the groups by the day of the last change, the icon of the trip, the start of
 * the last message, the search over the titles and the messages, and the traveller's recent requests.
 */

/** The kind of trip a chat is about, from its brief: the icon of the chat in the list. */
export type ChatKind = 'sea' | 'mountains' | 'city' | 'romantic' | 'weekend' | 'exotic' | 'metropolis' | 'chat'

const KIND_OF_VIBE: Record<NonNullable<Exclude<Brief['vibe'], 'any'>>, ChatKind> = {
  sea: 'sea',
  mountains: 'mountains',
  europe: 'city',
  romantic: 'romantic',
  weekend: 'weekend',
  exotic: 'exotic',
  metropolis: 'metropolis',
}

/** The theme of the trip, or a city for a named one; a chat without either is a plain chat. */
export function chatKind(brief: Brief): ChatKind {
  if (brief.vibe && brief.vibe !== 'any') return KIND_OF_VIBE[brief.vibe]
  return brief.destinationId ? 'city' : 'chat'
}

export type ChatGroupLabel = 'Сегодня' | 'Вчера' | 'На прошлой неделе' | 'Раньше'

export interface ChatGroup {
  label: ChatGroupLabel
  chats: Chat[]
}

/** The calendar day of an ISO timestamp in the browser's time zone. */
const dayOf = (iso: string): IsoDate => toIso(new Date(iso))

/** Days between two calendar days, by the calendar (a change of the clocks does not matter). */
const daysBetween = (from: IsoDate, to: IsoDate) => nightsBetween(from, to)

/** The group of a chat changed at `iso`: today, yesterday, within the last seven days or earlier. */
export function chatGroupOf(iso: string, now: Date): ChatGroupLabel {
  const days = daysBetween(dayOf(iso), toIso(now))
  if (days <= 0) return 'Сегодня'
  if (days === 1) return 'Вчера'
  if (days <= 7) return 'На прошлой неделе'
  return 'Раньше'
}

const GROUP_ORDER: readonly ChatGroupLabel[] = ['Сегодня', 'Вчера', 'На прошлой неделе', 'Раньше']

/** The chats in their groups, the groups in time order, the chats in the given order (newest first); no empty group. */
export function groupChats(chats: readonly Chat[], now: Date): ChatGroup[] {
  const groups = new Map<ChatGroupLabel, Chat[]>()
  for (const chat of chats) {
    const label = chatGroupOf(chat.updatedAt, now)
    groups.set(label, [...(groups.get(label) ?? []), chat])
  }
  return GROUP_ORDER.flatMap((label) => {
    const list = groups.get(label)
    return list ? [{ label, chats: list }] : []
  })
}

const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' })

/** «12:24» for a time of today, «03 окт» before. */
export function chatTime(iso: string, now: Date): string {
  const date = new Date(iso)
  return dayOf(iso) === toIso(now) ? timeFormat.format(date) : dayFormat.format(date).replace('.', '')
}

/** «12:24»: the time under a message. */
export const messageTime = (iso: string) => timeFormat.format(new Date(iso))

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

/** The last words in the chat: of the traveller or of Эвал, not the steps of the agents or a pending answer. */
export function chatPreview(chat: Chat): string {
  const last = chat.messages.findLast(
    (m) => (m.role === 'user' || m.role === 'assistant' || m.role === 'owner') && m.status === 'done' && m.text.trim(),
  )
  return last ? oneLine(last.text) : ''
}

const normalize = (text: string) => text.toLocaleLowerCase('ru').replace(/ё/g, 'е')

/** The chats whose title or any message has the words of `query`, in their order; an empty query keeps all. */
export function searchChats(chats: readonly Chat[], query: string): Chat[] {
  const needle = normalize(oneLine(query))
  if (!needle) return [...chats]
  return chats.filter(
    (chat) => normalize(chat.title).includes(needle) || chat.messages.some((m) => normalize(m.text).includes(needle)),
  )
}

/** Recent requests a column shows. */
export const RECENT_REQUESTS = 5

/** The traveller's newest different messages over all the chats, newest first. */
export function recentRequests(chats: readonly Chat[], limit = RECENT_REQUESTS): string[] {
  const messages = chats
    .flatMap((chat) => chat.messages)
    .filter((m) => m.role === 'user' && m.text.trim())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const seen = new Set<string>()
  const requests: string[] = []
  for (const message of messages) {
    const text = oneLine(message.text)
    const key = normalize(text)
    if (seen.has(key)) continue
    seen.add(key)
    requests.push(text)
    if (requests.length === limit) break
  }
  return requests
}

/** The newest plan of the chat: the hotels of the last answer. */
export const lastPlan = (chat: Chat): Plan | undefined =>
  chat.messages.findLast((m) => m.role === 'assistant' && m.data.plan)?.data.plan

/** What the chat knows of the trip: from its brief first, then from the newest plan. */
export interface TripParams {
  checkIn?: IsoDate
  checkOut?: IsoDate
  nights?: number
  guests?: Guests
  city?: Destination
}

/**
 * The trip of the chat: the named days and the party of the brief, or the dates and the guests the newest plan
 * took; the named city of the brief, or the one city of the newest plan. Nothing is made up: what neither knows
 * is absent.
 */
export function tripParams(chat: Chat, destinations: readonly Destination[]): TripParams {
  const { brief } = chat
  const plan = lastPlan(chat)
  const dates = brief.dates ?? (plan && { checkIn: plan.query.checkIn, checkOut: plan.query.checkOut })
  const guests = brief.party && brief.party !== 'any' ? PARTY_GUESTS[brief.party] : plan ? plan.query.guests : undefined
  const planCities = new Set(plan?.options.map((o) => o.destination.id))
  const cityId = brief.destinationId ?? (planCities.size === 1 ? [...planCities][0] : undefined)
  const city = destinations.find((d) => d.id === cityId)
  return {
    ...(dates && { ...dates, nights: nightsBetween(dates.checkIn, dates.checkOut) }),
    ...(guests && { guests }),
    ...(city && { city }),
  }
}

const shortDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
const sameMonth = (a: IsoDate, b: IsoDate) => a.slice(0, 7) === b.slice(0, 7)

/** «25–26 окт», «30 окт – 2 нояб». */
export function tripDates(checkIn: IsoDate, checkOut: IsoDate): string {
  const [a, b] = [fromIso(checkIn), fromIso(checkOut)]
  const end = shortDay.format(b).replace('.', '')
  return sameMonth(checkIn, checkOut) ? `${a.getDate()}–${end}` : `${shortDay.format(a).replace('.', '')} – ${end}`
}

/** «2 гостя · 25–26 окт · Валенсия»: the line under the chat's title; empty when the chat knows none of it. */
export function tripLine(params: TripParams): string {
  return [
    params.guests && guestsLabel(params.guests),
    params.checkIn && params.checkOut && tripDates(params.checkIn, params.checkOut),
    params.city?.name,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** «2 ночи». */
export const nightsLabel = (nights: number) => countRu(nights, ['ночь', 'ночи', 'ночей'])

/** The map of the answer's hotels: the search page with them on the plan's dates (its map beside the list). */
export const planMapHref = (plan: Plan) =>
  selectionHref(
    { hotels: plan.options.flatMap((o) => (o.hotel ? [o.hotel.id] : [])), from: 'assistant', pick: '' },
    { checkIn: plan.query.checkIn, checkOut: plan.query.checkOut, guests: plan.query.guests },
  )
