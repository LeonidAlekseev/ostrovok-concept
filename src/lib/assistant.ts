import type { Destination } from '../data/destinations'
import type { HotelSummary } from './catalog'
import { addDays, fromIso, toIso, type IsoDate } from './dates'
import { countRu, formatPrice } from './format'
import { stayTotal } from './offer'
import type { Persona } from './routes'
import { MAX_NIGHTS, type Guests, type SearchQuery } from './search'

/**
 * Travel assistant: a free-text wish is read by the language model behind `POST /api/assistant`
 * (`askAssistant`), or with keyword rules when the model is unavailable; missing essentials are asked
 * one question at a time, and the "atmosphere" of the trip is decided from what is known locally.
 */

export type VibeId = 'sea' | 'mountains' | 'europe' | 'romantic' | 'weekend' | 'exotic' | 'metropolis'
type Mood = 'calm' | 'active'
export type Party = 'solo' | 'couple' | 'family' | 'friends'
/** Zero-based month, or "as soon as possible". `any` means the traveller left it to the assistant. */
type When = number | 'soon' | 'any'

export interface Brief {
  vibe?: VibeId | 'any'
  destinationId?: string
  when?: When
  nights?: number
  party?: Party | 'any'
  mood?: Mood
  /** Whole-stay budget, ₽. */
  budget?: number
}

export type QuestionId = 'vibe' | 'when' | 'party'

export interface Question {
  id: QuestionId
  text: string
  /** Quick replies; each is sent as if the traveller typed it. */
  replies: string[]
}

export interface AssistantOption {
  destination: Destination
  hotel?: HotelSummary
  perNight: number
  total: number
  fitsBudget: boolean
}

export interface Plan {
  emoji: string
  atmosphere: string
  why: string
  query: Omit<SearchQuery, 'destination'>
  nights: number
  options: AssistantOption[]
  overBudget: boolean
}

export const starterChips = [
  { emoji: '🌴', label: 'На море' },
  { emoji: '⛰️', label: 'В горы' },
  { emoji: '🏛️', label: 'Города Европы' },
  { emoji: '💑', label: 'Романтика' },
  { emoji: '🧳', label: 'На выходные' },
  { emoji: '🌃', label: 'Мегаполис' },
]

const MONTHS = [
  'январ',
  'феврал',
  'март',
  'апрел',
  'ма[йея]',
  'июн',
  'июл',
  'август',
  'сентябр',
  'октябр',
  'ноябр',
  'декабр',
]
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
const SEASONS: [RegExp, number][] = [
  [/зим/, 0],
  [/весн/, 4],
  [/лет[оа]м?(?![а-яё])/, 6],
  [/осен/, 9],
]

/** Cyrillic-aware word start: `\b` only knows ASCII letters. */
const word = (stem: string) => new RegExp(`(?<![а-яё])(?:${stem})`)

const VIBE_RULES: [VibeId, RegExp][] = [
  ['romantic', word('романт|медов|свидан|годовщин|для двоих')],
  ['sea', word('мор[еяюи]|пляж|океан|побереж|купат|загора')],
  ['mountains', word('гор(?!од)|лыж|поход|трекк|треккинг')],
  ['exotic', word('экзот|тропи|далек|далёк|пальм|ази[яи]')],
  ['metropolis', word('мегапол|небоскр|шопинг|большой город|огни')],
  ['europe', word('европ|старин|архитект|музе|город')],
  ['weekend', word('выходн|уикенд')],
]

const PARTY_RULES: [Party, RegExp][] = [
  ['family', word('дет|ребен|ребён|сын|доч|семь[ёе]?й|семьей|семья')],
  ['friends', word('друз|компани|коллег')],
  ['couple', word('вдво[её]м|с девушк|с парн|с жен|с муж|пар[аой]|любим')],
  ['solo', word('один|одна|сам[аи]?(?![а-яё])|в одиночку|соло')],
]

const ANY = word('не важно|неважно|вс[её] равно|любо[ей]|не знаю|удиви|на тво[йё]|реши сам|выбери сам|без разницы')

const normalize = (s: string) => s.toLocaleLowerCase('ru').replace(/ /g, ' ')

/** Reads whatever the text says about the trip; fields it does not mention stay undefined. */
export function parseWish(input: string, destinations: readonly Destination[]): Brief {
  const text = normalize(input)
  const brief: Brief = {}

  const named = destinations.find((d) => text.includes(normalize(d.name)))
  if (named) brief.destinationId = named.id
  brief.vibe = VIBE_RULES.find(([, re]) => re.test(text))?.[0]
  brief.party = PARTY_RULES.find(([, re]) => re.test(text))?.[0]
  if (word('спокойн|тих|релакс|отдохн|уедин|без суеты').test(text)) brief.mood = 'calm'
  else if (word('актив|движ|тусов|вечеринк|ночн|приключ|драйв').test(text)) brief.mood = 'active'

  const month = MONTHS.findIndex((stem) => word(stem).test(text))
  if (month >= 0) brief.when = month
  else if (word('скоро|ближайш|сейчас|завтра|срочно').test(text)) brief.when = 'soon'
  else {
    const season = SEASONS.find(([re]) => re.test(text))
    if (season) brief.when = season[1]
  }

  const nights = text.match(/(\d+)\s*(?:ноч|дн|сут)/)
  if (nights) brief.nights = Number(nights[1])
  else if (word('две недели').test(text)) brief.nights = 14
  else if (word('недел').test(text)) brief.nights = 7
  if (brief.vibe === 'weekend' || word('выходн|уикенд').test(text)) {
    brief.nights ??= 2
    brief.when ??= 'soon'
  }

  // "до 70 000 ₽", "70к", "70 тыс.", "бюджет 120000" — but not "на 5 ночей".
  for (const m of text.matchAll(/(\d[\d ]*\d|\d)\s*(тыс[а-я.]*|к(?![а-яё])|₽|руб[а-я.]*|р\.)?/g)) {
    const value = Number(m[1].replace(/ /g, ''))
    const suffix = m[2] ?? ''
    const amount = /^(тыс|к)/.test(suffix) ? value * 1000 : value
    if (suffix || amount >= 3000) {
      brief.budget = amount
      break
    }
  }
  return brief
}

/** Folds a new reply into the brief. A "don't care" answers the question that was asked. */
export function mergeBrief(
  brief: Brief,
  input: string,
  asked: QuestionId | null,
  destinations: readonly Destination[],
): Brief {
  return foldBrief(brief, parseWish(input, destinations), input, asked)
}

/** `mergeBrief` for a reply already read (by the rules or by the language model). */
export function foldBrief(brief: Brief, parsed: Brief, input: string, asked: QuestionId | null): Brief {
  const next: Brief = { ...brief }
  for (const key of Object.keys(parsed) as (keyof Brief)[]) {
    if (parsed[key] !== undefined) Object.assign(next, { [key]: parsed[key] })
  }
  // The trip's theme is set by the first message; a later "на выходные" only sets the dates.
  if (brief.vibe && brief.vibe !== 'any' && parsed.vibe === 'weekend') next.vibe = brief.vibe
  // Without a pending question, "удиви меня" hands over the theme.
  const open = asked ?? (next.vibe || next.destinationId ? null : 'vibe')
  if (open && next[open] === brief[open] && ANY.test(normalize(input))) next[open] = 'any'
  return next
}

export function nextQuestion(brief: Brief, today: IsoDate): Question | null {
  if (!brief.vibe && !brief.destinationId)
    return {
      id: 'vibe',
      text: 'Какое настроение у поездки? Море, горы, старые города — или довериться мне?',
      replies: ['На море', 'В горы', 'Города Европы', 'Романтика', 'Удиви меня'],
    }
  if (brief.when === undefined) {
    const month = fromIso(today).getMonth()
    return {
      id: 'when',
      text: 'Когда планируете поехать?',
      replies: ['В ближайшие выходные', ...[1, 2, 3].map((k) => `В ${MONTH_IN[(month + k) % 12]}`), 'Не важно'],
    }
  }
  if (!brief.party)
    return {
      id: 'party',
      text: 'С кем едете? Так я подберу номер и формат отдыха.',
      replies: ['Один', 'Вдвоём', 'С детьми', 'С друзьями'],
    }
  return null
}

const VIBE_DESTINATIONS: Partial<Record<VibeId, string[]>> = {
  mountains: ['almaty', 'tbilisi', 'vancouver', 'reykjavik'],
  romantic: ['paris', 'florence', 'prague', 'lisbon', 'rome', 'marrakesh', 'honolulu'],
  exotic: ['cancun', 'honolulu', 'marrakesh', 'dubai', 'tokyo', 'delhi'],
  metropolis: ['new-york', 'tokyo', 'seoul', 'london', 'dubai', 'beijing'],
}
/** Beaches that stay warm from November to March. */
const WARM_IN_WINTER = new Set(['dubai', 'cancun', 'honolulu', 'miami'])
const isWinter = (month: number) => month >= 10 || month <= 2

function candidatesFor(vibe: VibeId, month: number, destinations: readonly Destination[]): Destination[] {
  const ids = VIBE_DESTINATIONS[vibe]
  const list = ids
    ? ids.flatMap((id) => destinations.find((d) => d.id === id) ?? [])
    : destinations.filter((d) => d.scenarios.includes(vibe as 'sea' | 'weekend' | 'europe'))
  if (vibe === 'sea' && isWinter(month)) return list.filter((d) => WARM_IN_WINTER.has(d.id))
  return list
}

/** The assistant's own pick when the traveller leaves the theme open. */
function chooseVibe(brief: Brief, month: number): { vibe: VibeId; reason: string } {
  if (brief.party === 'family') return { vibe: 'sea', reason: 'с детьми проще всего у тёплого моря' }
  if (isWinter(month)) return { vibe: 'exotic', reason: 'зимой хочется туда, где лето' }
  if (month >= 5 && month <= 7) return { vibe: 'sea', reason: 'лето создано для моря' }
  if (brief.party === 'couple') return { vibe: 'romantic', reason: 'вдвоём лучше всего там, где красиво' }
  if (brief.mood === 'active') return { vibe: 'metropolis', reason: 'для движа нужен большой город' }
  return { vibe: 'europe', reason: 'межсезонье — лучшее время гулять по старым городам' }
}

const ATMOSPHERES: Record<VibeId, Record<Mood | 'default', [emoji: string, title: string, text: string]>> = {
  sea: {
    calm: ['🏝️', 'Тихий берег', 'шум волн, долгие завтраки и никакой суеты'],
    active: ['☀️', 'Солнце и движ', 'пляж днём, бары и музыка вечером'],
    default: ['🌊', 'Морской бриз', 'солёный ветер, пляж и закаты над водой'],
  },
  mountains: {
    calm: ['🏔️', 'Горное уединение', 'чистый воздух, тишина и вид из окна'],
    active: ['🥾', 'Тропы и вершины', 'походы днём и горячий ужин после'],
    default: ['⛰️', 'Горный воздух', 'виды, тропы и уютные вечера'],
  },
  europe: {
    calm: ['☕', 'Неспешная Европа', 'кофейни, музеи и прогулки без маршрута'],
    active: ['🚲', 'Европейский драйв', 'много города, гастробары и ночные улицы'],
    default: ['🏛️', 'Старые улочки', 'брусчатка, архитектура и вечерние огни'],
  },
  romantic: {
    calm: ['🕯️', 'Только вдвоём', 'красивые виды, ужины и медленные утра'],
    active: ['💃', 'Яркий роман', 'прогулки до ночи и новые впечатления'],
    default: ['💞', 'Романтика', 'город, в который влюбляешься вдвоём'],
  },
  weekend: {
    calm: ['🧺', 'Тихий уикенд', 'выдохнуть пару дней недалеко от дома'],
    active: ['🧳', 'Короткий побег', 'максимум впечатлений за два дня'],
    default: ['🧳', 'Короткий побег', 'смена картинки без долгого перелёта'],
  },
  exotic: {
    calm: ['🌴', 'Далеко-далеко', 'другой климат, другой ритм, полная перезагрузка'],
    active: ['🧭', 'Большое приключение', 'новые вкусы, рынки и необычные места'],
    default: ['🌴', 'Далеко-далеко', 'лето посреди любого сезона'],
  },
  metropolis: {
    calm: ['🌆', 'Город с высоты', 'панорамы, галереи и тихие отели в центре'],
    active: ['🌃', 'Огни мегаполиса', 'небоскрёбы, шопинг и жизнь до утра'],
    default: ['🌃', 'Огни мегаполиса', 'энергия большого города'],
  },
}

const PARTY_GUESTS: Record<Party, Guests> = {
  solo: { adults: 1, children: 0, rooms: 1 },
  couple: { adults: 2, children: 0, rooms: 1 },
  family: { adults: 2, children: 1, rooms: 1 },
  friends: { adults: 4, children: 0, rooms: 2 },
}

/** First day on or after `from` that falls on `weekday` (0 = Sunday). */
function nextWeekday(from: IsoDate, weekday: number): IsoDate {
  return addDays(from, (weekday - fromIso(from).getDay() + 7) % 7)
}

function travelDates(brief: Brief, nights: number, today: IsoDate): IsoDate {
  const tomorrow = addDays(today, 1)
  const weekday = nights <= 3 ? 5 : 6
  const { when } = brief
  if (when === 'soon') return nextWeekday(tomorrow, weekday)
  if (typeof when !== 'number') return nextWeekday(addDays(today, 14), weekday)
  const now = fromIso(today)
  const year = when < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear()
  const first = toIso(new Date(year, when, 1))
  return nextWeekday(first < tomorrow ? tomorrow : first, weekday)
}

/** The month the trip falls in, to judge the season. */
const tripMonth = (brief: Brief, today: IsoDate) =>
  typeof brief.when === 'number' ? brief.when : fromIso(addDays(today, brief.when === 'soon' ? 3 : 14)).getMonth()

/** The theme of the plan (the traveller's, the named city's or the assistant's own pick) and its cities. */
function planScope(brief: Brief, today: IsoDate, destinations: readonly Destination[]) {
  const month = tripMonth(brief, today)
  const named = destinations.find((d) => d.id === brief.destinationId)
  const own = brief.vibe && brief.vibe !== 'any' ? { vibe: brief.vibe, reason: '' } : null
  const fallbackVibe = named?.scenarios[0] ?? 'europe'
  const { vibe, reason } = own ?? (named ? { vibe: fallbackVibe, reason: '' } : chooseVibe(brief, month))
  return { vibe, reason, named, pool: named ? [named] : candidatesFor(vibe, month, destinations) }
}

/** The cities the plan of a complete `brief` picks from: the semantic search looks for hotels there. */
export const planCities = (brief: Brief, today: IsoDate, destinations: readonly Destination[]): Destination[] =>
  planScope(brief, today, destinations).pool

/** Options in a plan. */
const PLAN_OPTIONS = 3

/**
 * The plan over the `destinations`, with a hotel from `hotels` (the "recently added" ones) where a city has
 * one. `matches` are the hotels the semantic search found for the traveller's words, best first: they lead
 * the plan — up to three in a named city, otherwise one a city, the rest by the rules.
 */
export function makePlan(
  brief: Brief,
  today: IsoDate,
  destinations: readonly Destination[],
  hotels: readonly HotelSummary[],
  matches: readonly HotelSummary[] = [],
): Plan {
  const { vibe, reason, named, pool } = planScope(brief, today, destinations)
  const [emoji, atmosphere, text] = ATMOSPHERES[vibe][brief.mood ?? 'default']

  const nights = Math.min(brief.nights ?? (vibe === 'weekend' ? 2 : brief.party === 'family' ? 7 : 5), MAX_NIGHTS)
  const guests = PARTY_GUESTS[brief.party && brief.party !== 'any' ? brief.party : 'couple']
  const checkIn = travelDates(brief, nights, today)

  // Quiet and romantic trips get the best-rated hotel; active ones and tight budgets the cheaper good one.
  const preferCheap = brief.mood === 'active' || brief.party === 'friends'
  const checkOut = addDays(checkIn, nights)
  const total = (perNight: number) => stayTotal(perNight, checkIn, checkOut, guests.rooms)
  const option = (destination: Destination, hotel: HotelSummary | undefined): AssistantOption => {
    const perNight = hotel?.priceFrom ?? destination.priceFrom
    const sum = total(perNight)
    return { destination, hotel, perNight, total: sum, fitsBudget: !brief.budget || sum <= brief.budget }
  }

  // The semantic matches in the plan's cities keep their order, within the budget first.
  const cityOf = new Map(pool.map((d) => [d.id, d]))
  const found: AssistantOption[] = []
  for (const hotel of matches) {
    const destination = cityOf.get(hotel.destinationId)
    if (!destination || (!named && found.some((o) => o.destination.id === destination.id))) continue
    found.push(option(destination, hotel))
  }
  found.sort((a, b) => Number(b.fitsBudget) - Number(a.fitsBudget))

  const ruled = pool
    .filter((destination) => !found.some((o) => o.destination.id === destination.id))
    .map((destination) => {
      const cityHotels = hotels
        .filter((h) => h.destinationId === destination.id)
        .sort((a, b) => (preferCheap ? a.priceFrom - b.priceFrom : b.rating - a.rating))
      const affordable = cityHotels.find((h) => !brief.budget || total(h.priceFrom) <= brief.budget)
      const cheapest = cityHotels.reduce<HotelSummary | undefined>(
        (min, h) => (!min || total(h.priceFrom) < total(min.priceFrom) ? h : min),
        undefined,
      )
      return option(destination, affordable ?? cheapest)
    })
    .sort(
      (a, b) =>
        Number(b.fitsBudget) - Number(a.fitsBudget) ||
        (b.hotel?.rating ?? 8) - (a.hotel?.rating ?? 8) ||
        a.total - b.total,
    )
  const options = [...found, ...ruled].slice(0, PLAN_OPTIONS)

  const why = reason ? `Выбрал сам: ${reason}. Значит, ${text}.` : `${text[0].toLocaleUpperCase('ru')}${text.slice(1)}.`
  return {
    emoji,
    atmosphere,
    why,
    query: { checkIn, checkOut, guests },
    nights,
    options,
    overBudget: options.length > 0 && !options.some((o) => o.fitsBudget),
  }
}

const WORK = word('работ|удал[её]нк|ноутбук|воркейшн|созвон|коворк')
const LUXURY = word('люкс|роскош|премиум|пятизв|5 звёзд|5 звезд|дорог[оу]|шикар')
const STUDENT = word('студен|бюджетн|дёшев|дешев|недорог|хостел|эконом')
/** A night above this, ₽, is luxury, below the other a student's. */
const LUXURY_NIGHT = 25_000
const STUDENT_NIGHT = 6_000

/**
 * The persona of the ready-made routes for the traveller's words (all their messages) and the brief: work
 * on the way, then luxury by the words or the budget a night, then a student's trip by the words, the
 * friends or the budget, else the culture.
 */
export function briefPersona(brief: Brief, wish: string, nights: number): Persona {
  const text = normalize(wish)
  const perNight = brief.budget ? brief.budget / Math.max(nights, 1) : undefined
  if (WORK.test(text)) return 'workation'
  if (LUXURY.test(text) || (perNight !== undefined && perNight >= LUXURY_NIGHT)) return 'luxury'
  if (STUDENT.test(text) || brief.party === 'friends' || (perNight !== undefined && perNight <= STUDENT_NIGHT))
    return 'student'
  return 'culture'
}

export const PARTY_LABEL: Record<Party, string> = {
  solo: 'один',
  couple: 'вдвоём',
  family: 'с детьми',
  friends: 'с друзьями',
}
export const VIBE_LABEL: Record<VibeId, string> = {
  sea: 'море',
  mountains: 'горы',
  europe: 'города Европы',
  romantic: 'романтика',
  weekend: 'на выходные',
  exotic: 'экзотика',
  metropolis: 'мегаполис',
}

/** What the assistant has understood so far, e.g. "море · в октябре · до 70 000 ₽". */
export function describeBrief(brief: Brief, destinations: readonly Destination[]): string {
  const named = destinations.find((d) => d.id === brief.destinationId)
  return [
    named?.name ?? (brief.vibe && brief.vibe !== 'any' ? VIBE_LABEL[brief.vibe] : null),
    brief.mood === 'calm' ? 'спокойно' : brief.mood === 'active' ? 'активно' : null,
    typeof brief.when === 'number' ? `в ${MONTH_IN[brief.when]}` : brief.when === 'soon' ? 'в ближайшее время' : null,
    brief.nights ? countRu(brief.nights, ['ночь', 'ночи', 'ночей']) : null,
    brief.party && brief.party !== 'any' ? PARTY_LABEL[brief.party] : null,
    brief.budget ? `до ${formatPrice(brief.budget)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

const MOODS: readonly Mood[] = ['calm', 'active']
const intIn = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined

/**
 * Keeps only what the assistant understands: a catalog city, known themes and answers, a month 0–11,
 * 1–30 nights and a whole budget in ₽. Reads untrusted input — the client's brief or the model's answer.
 */
export function normalizeBrief(
  raw: Partial<Record<keyof Brief, unknown>>,
  destinations: readonly Destination[],
): Brief {
  const brief: Brief = {}
  const { vibe, destinationId, when, nights, party, mood, budget } = raw
  if (vibe === 'any' || (typeof vibe === 'string' && Object.hasOwn(VIBE_LABEL, vibe))) brief.vibe = vibe as VibeId
  if (destinations.some((d) => d.id === destinationId)) brief.destinationId = destinationId as string
  if (when === 'soon' || when === 'any') brief.when = when
  else if (intIn(when, 0, 11) !== undefined) brief.when = when as number
  if (typeof nights === 'number' && nights >= 1) brief.nights = Math.min(Math.round(nights), MAX_NIGHTS)
  if (party === 'any' || (typeof party === 'string' && Object.hasOwn(PARTY_LABEL, party))) brief.party = party as Party
  if (MOODS.includes(mood as Mood)) brief.mood = mood as Mood
  if (typeof budget === 'number' && budget >= 1) brief.budget = Math.round(budget)
  return brief
}

/** `POST /api/assistant`. Message texts are capped at `MAX_MESSAGE_LENGTH`, the history at `MAX_HISTORY`. */
export interface AssistantRequest {
  messages: { role: 'user' | 'assistant'; text: string }[]
  brief: Brief
}

export interface AssistantResponse {
  brief: Brief
  /** The model's short remark; absent when the rules read the message. */
  reply?: string
  source: 'model' | 'rules'
  /** Hotels the semantic search found for the traveller's words once the brief is complete, best first. */
  matches?: HotelSummary[]
  /** The ready-made route the search by meaning found for the traveller's words with the plan. */
  routeId?: string
}

export const MAX_MESSAGE_LENGTH = 500
export const MAX_HISTORY = 20
/**
 * The client's own limit: the route gives the model 8 s (the rules after that) and answers within 14 s with
 * the semantic search's hotels, when the plan is due.
 */
const ASSISTANT_TIMEOUT_MS = 15_000

/**
 * Reads the newest message of `messages` into `brief` through the assistant route. Any failure — no
 * network, a limit, a timeout — falls back to the rules here, so the dialog never shows an error.
 */
export async function askAssistant(
  request: AssistantRequest,
  asked: QuestionId | null,
  destinations: readonly Destination[],
  signal?: AbortSignal,
): Promise<AssistantResponse> {
  // A reply with a plan only has no text; long replies of the assistant are cut to the route's limit.
  const messages = request.messages
    .filter((m) => m.text.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ ...m, text: m.text.slice(0, MAX_MESSAGE_LENGTH) }))
  const body: AssistantRequest = { ...request, messages }
  try {
    const response = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(ASSISTANT_TIMEOUT_MS)])
        : AbortSignal.timeout(ASSISTANT_TIMEOUT_MS),
    })
    if (response.ok) {
      const data = (await response.json()) as AssistantResponse
      return {
        brief: normalizeBrief(data.brief ?? {}, destinations),
        reply: typeof data.reply === 'string' ? data.reply : undefined,
        source: data.source === 'model' ? 'model' : 'rules',
        matches: Array.isArray(data.matches) ? data.matches : undefined,
        routeId: typeof data.routeId === 'string' ? data.routeId : undefined,
      }
    }
  } catch {
    // Falls through to the rules below.
  }
  const input = request.messages.at(-1)?.text ?? ''
  return { brief: mergeBrief(request.brief, input, asked, destinations), source: 'rules' }
}
