import type { Destination } from '../data/destinations'
import type { HotelSummary } from './catalog'
import {
  CRITERION_LABEL,
  VIEW_LABEL,
  featureReasons,
  type Criterion,
  type HotelFeatures,
  type ViewKind,
} from './features'
import { addDays, formatShortRange, fromIso, nightsBetween, toIso, type IsoDate } from './dates'
import { countRu, formatMeters, formatPrice } from './format'
import { parseChatMap, type ChatMap } from './geo/chatMap'
import { stayTotal } from './offer'
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

/** The named days of a stay («с 10 по 15 ноября»): check-in and check-out. */
export interface StayDates {
  checkIn: IsoDate
  checkOut: IsoDate
}

export interface Brief {
  vibe?: VibeId | 'any'
  destinationId?: string
  when?: When
  /** The named days of the stay: the plan's dates; `when` is their month and `nights` their length. */
  dates?: StayDates
  /** Named days that are past, impossible or too long: they are not taken, and Эвал asks for them. */
  datesRejected?: true
  nights?: number
  party?: Party | 'any'
  mood?: Mood
  /** Whole-stay budget, ₽. */
  budget?: number
  /** A quiet place at night: the noise map's night band (`hotel_features`). */
  quiet?: true
  /** A taller or a lower building. */
  height?: 'high' | 'low'
  /** A window view of a room; `any` is «с видом» without saying of what. */
  view?: ViewKind | 'any'
  /** The sea within so many metres of the hotel: «близко к морю» is 1 km, «до моря 500 м» is 500. */
  seaMaxM?: number
  /** The guests and rooms set by hand: they take over the party's (`PARTY_GUESTS`). */
  guests?: Guests
  /** The hotel the chat is about (a chat opened on a hotel's page): Эвал answers about it instead of picking hotels. */
  hotelId?: string
}

export type QuestionId = 'vibe' | 'when' | 'party' | 'dates'

export interface Question {
  /** `photo` asks what to do with the photos of the message; it is not a part of the brief. */
  id: QuestionId | 'photo'
  text: string
  /** Quick replies; each is sent as if the traveller typed it. */
  replies: string[]
}

/** A question of the brief: what the plan still lacks. */
type BriefQuestion = Question & { id: QuestionId }

export interface AssistantOption {
  destination: Destination
  hotel?: HotelSummary
  perNight: number
  total: number
  fitsBudget: boolean
  /** Why the hotel fits: «ночью ниже 40 дБ», «здание 12 этажей», «нет данных о шуме». Absent in older plans. */
  reasons?: string[]
  /** The views the hotel's room names tell of (`hotel_room_views`); absent without data and in older plans. */
  views?: ViewKind[]
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

/** The starter chips of the assistant; a chip with a `vibe` shows only while that theme has a city in the season. */
export const starterChips = [
  { emoji: '🏖️', label: 'На море', vibe: 'sea' },
  { emoji: '⛰️', label: 'В горы', vibe: 'mountains' },
  { emoji: '🏙️', label: 'В город', vibe: 'europe' },
  { emoji: '👨‍👩‍👧', label: 'С детьми' },
  { emoji: '✈️', label: 'Куда угодно' },
] as const satisfies readonly { emoji: string; label: string; vibe?: VibeId }[]

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

/** A quiet night: «тихий», «а потише», «чтобы ночью не шумело», «без шума». */
const QUIET = word('тих|тиш|не\\s+шум|без\\s+шума|шумоизол|выспат')
const HIGH = word('повыше|высок[а-яё]*\\s+(?:этаж|здан|дом)|высотк|высотн|верхн[а-яё]*\\s+этаж|многоэтаж|высоко')
const LOW = word('пониже|невысок|низк[а-яё]*\\s+(?:этаж|здан|дом)|малоэтаж|нижн[а-яё]*\\s+этаж|невысоко')
const VIEW_RULES: [ViewKind | 'any', RegExp][] = [
  ['sea', /вид[а-яё]*\s+на\s+(?:мор|океан|пляж|залив)/],
  ['water', /вид[а-яё]*\s+на\s+(?:воду|реку|озеро|канал|порт)/],
  ['mountain', /вид[а-яё]*\s+на\s+гор(?!од)/],
  ['park', /вид[а-яё]*\s+на\s+парк/],
  ['garden', /вид[а-яё]*\s+на\s+сад/],
  ['pool', /вид[а-яё]*\s+на\s+бассейн/],
  ['city', /вид[а-яё]*\s+на\s+(?:город|площадь)/],
  ['any', /(?<![а-яё])(?:с\s+видом|вид\s+из\s+окна|красив[а-яё]*\s+вид|панорамн|видовой)/],
]

/** «близко к морю», «ближе к пляжу», «рядом с морем», «у моря», «на берегу», «первая линия». */
const NEAR_SEA = word(
  '(?:близко|ближе|поближе|рядом|недалеко|неподал[её]ку|возле|около)\\s+(?:к\\s+|с\\s+|от\\s+)?(?:мор|пляж|берег)|у\\s+(?:самого\\s+)?(?:мор|пляж)|на\\s+(?:самом\\s+)?берегу|(?:мор[еяю]|пляж[ауи]?)\\s+(?:рядом|близко|недалеко|в\\s+шаговой)|шагов[а-яё]*\\s+доступност[а-яё]*\\s+(?:от|до)\\s+(?:мор|пляж)|перв[а-яё]*\\s+лини',
)
const SEA_WORD = '(?:мор[а-яё]*|пляж[а-яё]*|берег[а-яё]*)'
const DISTANCE = '(\\d+(?:[.,]\\d+)?)\\s*(км|километр[а-яё]*|м|метр[а-яё]*)(?![а-яё])'
/** «до моря не больше 500 м», «в 2 км от моря», «300 метров до пляжа». */
const SEA_DISTANCE = [
  new RegExp(`(?<![а-яё])${SEA_WORD}[^.!?,;\\d]{0,25}?${DISTANCE}`),
  new RegExp(`${DISTANCE}[^.!?,;\\d]{0,15}?(?<![а-яё])${SEA_WORD}`),
]
/** «Близко к морю» without a distance. */
export const NEAR_SEA_M = 1000
const MIN_SEA_M = 50
const MAX_SEA_M = 20_000

/** The distance to the sea the text names, m, and the words that named it (they are not a budget). */
function seaDistance(text: string): { meters: number; said: string } | undefined {
  for (const re of SEA_DISTANCE) {
    const m = text.match(re)
    if (!m) continue
    const value = Number(m[1].replace(',', '.')) * (m[2].startsWith('к') ? 1000 : 1)
    if (value > 0) return { meters: Math.min(Math.max(Math.round(value), MIN_SEA_M), MAX_SEA_M), said: m[0] }
  }
  return undefined
}

const ANY = word(
  'не важно|неважно|вс[её] равно|любо[ей]|не знаю|куда угодно|удиви|на тво[йё]|реши сам|выбери сам|без разницы',
)

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

  if (QUIET.test(text)) brief.quiet = true
  if (LOW.test(text)) brief.height = 'low'
  else if (HIGH.test(text)) brief.height = 'high'
  brief.view = VIEW_RULES.find(([, re]) => re.test(text))?.[0]
  const sea = seaDistance(text)
  if (sea) brief.seaMaxM = sea.meters
  else if (NEAR_SEA.test(text)) brief.seaMaxM = NEAR_SEA_M

  // "до 70 000 ₽", "70к", "70 тыс.", "бюджет 120000" — but not "на 5 ночей" or "в 3000 м от моря".
  for (const m of (sea ? text.replace(sea.said, ' ') : text).matchAll(/(\d[\d ]*\d|\d)\s*(тыс[а-я.]*|к(?![а-яё])|₽|руб[а-я.]*|р\.)?/g)) {
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
  // Rejected days are asked again only while the newest message still lacks them.
  delete next.datesRejected
  for (const key of Object.keys(parsed) as (keyof Brief)[]) {
    if (parsed[key] !== undefined) Object.assign(next, { [key]: parsed[key] })
  }
  // A month of its own ("в декабре") replaces the named days.
  if (parsed.when !== undefined && !parsed.dates) delete next.dates
  // The trip's theme is set by the first message; a later "на выходные" only sets the dates.
  if (brief.vibe && brief.vibe !== 'any' && parsed.vibe === 'weekend') next.vibe = brief.vibe
  // "не важно" for the dates asked drops the named days, so the plan goes by the month.
  if (asked === 'dates' && !parsed.dates && ANY.test(normalize(input))) delete next.dates
  // Without a pending question, "удиви меня" hands over the theme.
  const open = asked ?? (next.vibe || next.destinationId ? null : 'vibe')
  if (open && open !== 'dates' && next[open] === brief[open] && ANY.test(normalize(input))) next[open] = 'any'
  return next
}

/** The quick replies to the question of the theme, each with its theme; «Куда угодно» has none. */
const VIBE_REPLIES: [label: string, vibe: VibeId | null][] = [
  ['На море', 'sea'],
  ['В горы', 'mountains'],
  ['В город', 'europe'],
  ['Романтика', 'romantic'],
  ['Куда угодно', null],
]

/**
 * The question the brief still lacks. With the `destinations` shown, the themes without a city in the season are
 * not offered as quick replies.
 */
export function nextQuestion(
  brief: Brief,
  today: IsoDate,
  destinations?: readonly Destination[],
): BriefQuestion | null {
  // Named days that are not taken, or that have passed since they were named: the plan waits for them.
  if (brief.datesRejected || (brief.dates && brief.dates.checkIn < today))
    return {
      id: 'dates',
      text: 'Не могу взять эти даты: они уже прошли или не сходятся. Назовите даты заезда и выезда, например «с 10 по 15 ноября».',
      replies: [],
    }
  if (!brief.vibe && !brief.destinationId)
    return {
      id: 'vibe',
      text: 'Какое настроение у поездки? Море, горы, старые города — или довериться мне?',
      replies: VIBE_REPLIES.filter(
        ([, vibe]) => !vibe || !destinations || hasCandidates(vibe, brief, today, destinations),
      ).map(([label]) => label),
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

/**
 * The cities of a theme in the month. The sea in winter is the warm beaches only, unless the traveller named a distance
 * to the sea (`anySea`): then it is the sea, not the swimming, and every city by the sea counts.
 */
function candidatesFor(
  vibe: VibeId,
  month: number,
  destinations: readonly Destination[],
  anySea = false,
): Destination[] {
  const ids = VIBE_DESTINATIONS[vibe]
  const list = ids
    ? ids.flatMap((id) => destinations.find((d) => d.id === id) ?? [])
    : destinations.filter((d) => d.scenarios.includes(vibe as 'sea' | 'weekend' | 'europe'))
  if (vibe === 'sea' && isWinter(month) && !anySea) return list.filter((d) => WARM_IN_WINTER.has(d.id))
  return list
}

/**
 * The assistant's own pick when the traveller leaves the theme open: the seasonal favourites first, then the other
 * themes, and only a theme with a city shown for the season. `null` when no theme has one.
 */
function chooseVibe(
  brief: Brief,
  month: number,
  destinations: readonly Destination[],
): { vibe: VibeId; reason: string } | null {
  const favourites: { vibe: VibeId; reason: string }[] = []
  if (brief.party === 'family') favourites.push({ vibe: 'sea', reason: 'с детьми проще всего у тёплого моря' })
  if (isWinter(month)) favourites.push({ vibe: 'exotic', reason: 'зимой хочется туда, где лето' })
  if (month >= 5 && month <= 7) favourites.push({ vibe: 'sea', reason: 'лето создано для моря' })
  if (brief.party === 'couple') favourites.push({ vibe: 'romantic', reason: 'вдвоём лучше всего там, где красиво' })
  if (brief.mood === 'active') favourites.push({ vibe: 'metropolis', reason: 'для движа нужен большой город' })
  favourites.push({ vibe: 'europe', reason: 'межсезонье — лучшее время гулять по старым городам' })
  const others = (['sea', 'europe', 'romantic', 'exotic', 'metropolis'] as const).map((vibe) => ({
    vibe,
    reason: 'в эти даты есть подходящие города',
  }))
  return [...favourites, ...others].find(({ vibe }) => candidatesFor(vibe, month, destinations).length > 0) ?? null
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

/** The guests of a party: the plan's search and the trip's parameters on `/assistant`. */
export const PARTY_GUESTS: Record<Party, Guests> = {
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
  if (brief.dates) return brief.dates.checkIn
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

/** The theme has a city shown for the trip's season: a preset without one leads nowhere. */
const hasCandidates = (vibe: VibeId, brief: Brief, today: IsoDate, destinations: readonly Destination[]) =>
  candidatesFor(vibe, tripMonth(brief, today), destinations).length > 0

/** The starter chips: the themes with a city shown in the season of a trip planned today, and the two open ones. */
export const presetChips = (destinations: readonly Destination[], today: IsoDate) =>
  starterChips.filter((chip) => !('vibe' in chip) || hasCandidates(chip.vibe, {}, today, destinations))

/** The theme of the plan (the traveller's, the named city's or the assistant's own pick) and its cities. */
function planScope(brief: Brief, today: IsoDate, destinations: readonly Destination[]) {
  const month = tripMonth(brief, today)
  const named = destinations.find((d) => d.id === brief.destinationId)
  const own = brief.vibe && brief.vibe !== 'any' ? brief.vibe : null
  if (own || named) {
    const vibe = own ?? named?.scenarios[0] ?? 'europe'
    // The traveller's own sea is never left without a city: in winter without a warm beach shown, the cold ones.
    const cities = named ? [named] : candidatesFor(vibe, month, destinations, brief.seaMaxM !== undefined)
    const pool = cities.length > 0 ? cities : candidatesFor(vibe, month, destinations, true)
    return { vibe, reason: '', named, pool }
  }
  const picked = chooseVibe(brief, month, destinations)
  if (picked) return { ...picked, named, pool: candidatesFor(picked.vibe, month, destinations) }
  // No theme has a city shown for the season: the shown cities, under the theme of the first of them.
  return { vibe: destinations[0]?.scenarios[0] ?? 'europe', reason: '', named, pool: [...destinations] }
}

/** The cities the plan of a complete `brief` picks from: the semantic search looks for hotels there. */
export const planCities = (brief: Brief, today: IsoDate, destinations: readonly Destination[]): Destination[] =>
  planScope(brief, today, destinations).pool

/** Options in a plan. */
const PLAN_OPTIONS = 3

/** The different views of the hotel's room names, the street last: what a hotel card of the plan lists. */
const roomViews = (features: HotelFeatures | undefined): ViewKind[] =>
  [...new Set(features?.views.map((v) => v.view))].sort((a, b) => Number(a === 'street') - Number(b === 'street'))

/**
 * The plan over the `destinations`, with a hotel from `hotels` (the "recently added" ones) where a city has
 * one. `matches` are the hotels the semantic search found for the traveller's words, best first: they lead
 * the plan — up to three in a named city, otherwise one a city, the rest by the rules. A `strict` plan (the sea within
 * a distance, with data on the coast) takes only the matches within it, any city, and adds none by the rules: no
 * hotel within it is an empty plan, and Эвал offers to change the parameters.
 */
export function makePlan(
  brief: Brief,
  today: IsoDate,
  destinations: readonly Destination[],
  hotels: readonly HotelSummary[],
  matches: readonly HotelSummary[] = [],
  features: Readonly<Record<string, HotelFeatures>> = {},
  /** The hotels already shown in the chat: «Другие варианты» skips them. */
  exclude: ReadonlySet<string> = new Set(),
  strict = brief.seaMaxM !== undefined,
): Plan {
  const { vibe, reason, named, pool } = planScope(brief, today, destinations)
  const [emoji, atmosphere, text] = ATMOSPHERES[vibe][brief.mood ?? 'default']

  const nights = brief.dates
    ? nightsBetween(brief.dates.checkIn, brief.dates.checkOut)
    : Math.min(brief.nights ?? (vibe === 'weekend' ? 2 : brief.party === 'family' ? 7 : 5), MAX_NIGHTS)
  const guests = brief.guests ?? PARTY_GUESTS[brief.party && brief.party !== 'any' ? brief.party : 'couple']
  const checkIn = travelDates(brief, nights, today)

  // Quiet and romantic trips get the best-rated hotel; active ones and tight budgets the cheaper good one.
  const preferCheap = brief.mood === 'active' || brief.party === 'friends'
  const checkOut = addDays(checkIn, nights)
  const total = (perNight: number) => stayTotal(perNight, checkIn, checkOut, guests.rooms)
  const option = (destination: Destination, hotel: HotelSummary | undefined): AssistantOption => {
    const perNight = hotel?.priceFrom ?? destination.priceFrom
    const sum = total(perNight)
    const reasons = hotel ? featureReasons(features[hotel.id], brief) : []
    const views = hotel ? roomViews(features[hotel.id]) : []
    return {
      destination,
      hotel,
      perNight,
      total: sum,
      fitsBudget: !brief.budget || sum <= brief.budget,
      ...(reasons.length > 0 && { reasons }),
      ...(views.length > 0 && { views }),
    }
  }

  // The semantic matches in the plan's cities keep their order, within the budget first.
  const cityOf = new Map(pool.map((d) => [d.id, d]))
  const found: AssistantOption[] = []
  const near = (hotel: HotelSummary) => (features[hotel.id]?.seaM ?? Infinity) <= (brief.seaMaxM ?? Infinity)
  for (const hotel of matches) {
    if (exclude.has(hotel.id)) continue
    const destination = cityOf.get(hotel.destinationId)
    if (!destination) continue
    if (strict ? !near(hotel) : !named && found.some((o) => o.destination.id === destination.id)) continue
    found.push(option(destination, hotel))
  }
  found.sort((a, b) => Number(b.fitsBudget) - Number(a.fitsBudget))

  const ruled = (strict ? [] : pool)
    .filter((destination) => !found.some((o) => o.destination.id === destination.id))
    .map((destination) => {
      const cityHotels = hotels
        .filter((h) => h.destinationId === destination.id && !exclude.has(h.id))
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
  // «Другие варианты»: a city whose hotels were all shown has nothing new to offer.
  const options = [...found, ...ruled].filter((o) => exclude.size === 0 || o.hotel).slice(0, PLAN_OPTIONS)

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
    brief.dates
      ? formatShortRange(brief.dates.checkIn, brief.dates.checkOut)
      : typeof brief.when === 'number'
        ? `в ${MONTH_IN[brief.when]}`
        : brief.when === 'soon'
          ? 'в ближайшее время'
          : null,
    brief.nights ? countRu(brief.nights, ['ночь', 'ночи', 'ночей']) : null,
    brief.party && brief.party !== 'any' ? PARTY_LABEL[brief.party] : null,
    brief.budget ? `до ${formatPrice(brief.budget)}` : null,
    brief.quiet ? 'тихо ночью' : null,
    brief.height === 'high' ? 'здание повыше' : brief.height === 'low' ? 'здание пониже' : null,
    brief.view === 'any' ? 'с видом из окна' : brief.view ? `вид ${VIEW_LABEL[brief.view]}` : null,
    brief.seaMaxM ? `до моря до ${formatMeters(brief.seaMaxM)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

const MOODS: readonly Mood[] = ['calm', 'active']
const intIn = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Guests set by hand: 1–9 adults, 0–6 children, 1–5 rooms and no more rooms than adults. */
export const GUEST_LIMITS = { adults: [1, 9], children: [0, 6], rooms: [1, 5] } as const

export function briefGuests(value: unknown): Guests | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { adults, children, rooms } = value as Record<string, unknown>
  const a = intIn(adults, ...GUEST_LIMITS.adults)
  const c = intIn(children, ...GUEST_LIMITS.children)
  const r = intIn(rooms, ...GUEST_LIMITS.rooms)
  return a !== undefined && c !== undefined && r !== undefined && r <= a ? { adults: a, children: c, rooms: r } : undefined
}

/**
 * Two named days of a stay: real calendar days (not 31 февраля), check-out after check-in, at most `MAX_NIGHTS`
 * nights apart. Whether the check-in is still ahead is for the caller, who knows today.
 */
export function stayDates(checkIn: unknown, checkOut: unknown): StayDates | undefined {
  if (typeof checkIn !== 'string' || typeof checkOut !== 'string') return undefined
  if (![checkIn, checkOut].every((day) => ISO_DAY.test(day) && toIso(fromIso(day)) === day)) return undefined
  const nights = nightsBetween(checkIn, checkOut)
  return nights >= 1 && nights <= MAX_NIGHTS ? { checkIn, checkOut } : undefined
}

/** The brief's month and nights of named days: `when` is the month of the check-in, `nights` the stay's length. */
export function briefWithStay(dates: StayDates): Pick<Brief, 'dates' | 'when' | 'nights'> {
  return {
    dates,
    when: fromIso(dates.checkIn).getMonth(),
    nights: nightsBetween(dates.checkIn, dates.checkOut),
  }
}

const MAX_HOTEL_ID_LENGTH = 120

/**
 * Keeps only what the assistant understands: a catalog city, known themes and answers, a month 0–11,
 * 1–30 nights, named days of a stay and a whole budget in ₽. Reads untrusted input — the client's brief or the
 * model's answer.
 */
export function normalizeBrief(
  raw: Partial<Record<keyof Brief, unknown>>,
  destinations: readonly Destination[],
): Brief {
  const brief: Brief = {}
  const { vibe, destinationId, when, nights, party, mood, budget, quiet, height, view, dates, datesRejected } = raw
  const { hotelId, seaMaxM, guests } = raw
  if (vibe === 'any' || (typeof vibe === 'string' && Object.hasOwn(VIBE_LABEL, vibe))) brief.vibe = vibe as VibeId
  if (destinations.some((d) => d.id === destinationId)) brief.destinationId = destinationId as string
  if (when === 'soon' || when === 'any') brief.when = when
  else if (intIn(when, 0, 11) !== undefined) brief.when = when as number
  if (typeof nights === 'number' && nights >= 1) brief.nights = Math.min(Math.round(nights), MAX_NIGHTS)
  const { checkIn, checkOut } = (dates ?? {}) as Partial<StayDates>
  const stay = stayDates(checkIn, checkOut)
  if (stay) Object.assign(brief, briefWithStay(stay))
  if (datesRejected === true) brief.datesRejected = true
  if (party === 'any' || (typeof party === 'string' && Object.hasOwn(PARTY_LABEL, party))) brief.party = party as Party
  if (MOODS.includes(mood as Mood)) brief.mood = mood as Mood
  if (typeof budget === 'number' && budget >= 1) brief.budget = Math.round(budget)
  if (quiet === true) brief.quiet = true
  if (height === 'high' || height === 'low') brief.height = height
  if (view === 'any' || (typeof view === 'string' && Object.hasOwn(VIEW_LABEL, view))) brief.view = view as ViewKind
  if (typeof seaMaxM === 'number' && seaMaxM > 0)
    brief.seaMaxM = Math.min(Math.max(Math.round(seaMaxM), MIN_SEA_M), MAX_SEA_M)
  const counted = briefGuests(guests)
  if (counted) brief.guests = counted
  // Only the shape: the route checks the id against the catalogue.
  if (typeof hotelId === 'string' && hotelId && hotelId.length <= MAX_HOTEL_ID_LENGTH) brief.hotelId = hotelId
  return brief
}

/** `POST /api/assistant`. Message texts are capped at `MAX_MESSAGE_LENGTH`, the history at `MAX_HISTORY`. */
export interface AssistantRequest {
  messages: { role: 'user' | 'assistant'; text: string }[]
  brief: Brief
  /**
   * The photos of the traveller's newest message with photos (or of the one Эвал asked about): optimised WebP or
   * JPEG data URLs, at most `MAX_PHOTOS` (src/lib/imageOptimize.ts).
   */
  photos?: string[]
  /**
   * The parameters were changed by hand after «ничего не нашёл»: the route picks the hotels by the `brief` as it is
   * and does not read the newest message again.
   */
  rerun?: true
}

/** Photos a message takes. */
export const MAX_PHOTOS = 4
/** The text a message of photos only has in the dialog the model reads. */
export const PHOTO_TEXT = 'Фото'
export const PHOTO_SIMILAR = 'Найти похожие отели'
export const PHOTO_REFINE = 'Учесть в запросе'
/** What Эвал asks when the message does not say what to do with its photos. */
export const PHOTO_QUESTION: Question = {
  id: 'photo',
  text: 'Что сделать с фото? Могу найти похожие отели или учесть увиденное в запросе.',
  replies: [PHOTO_SIMILAR, PHOTO_REFINE],
}
/** What Эвал says when the photos show nothing a hotel is chosen by. */
export const PHOTO_UNUSABLE =
  'По такому фото не подобрать отель — опишите словами, что для вас важно: вид, стиль, место.'
/** What Эвал says when the search for similar hotels did not answer in time. */
export const PHOTO_MISSED =
  'Поиск похожих отелей сейчас не ответил — попробуйте ещё раз чуть позже или опишите словами, что для вас важно.'
/** What Эвал says when no model that sees photos answers and the message has no words: no key, no network. */
export const PHOTO_UNSEEN = 'Провайдер распознавания фото не отвечает. Повторите позже.'
/** What Эвал says over the limit of requests to every model that sees photos (or of the route). */
export const PHOTO_LIMITED = 'Превышен лимит запросов к модели распознавания фото. Повторите позже.'
/** What Эвал adds when no model that sees photos answered and the text models answered the message's words. */
export const PHOTO_SKIPPED = 'Модель распознавания фото сейчас недоступна — ответил без фото.'
/** Эвал's own message after an answer the rules gave because no text model answered. */
export const MODELS_DOWN =
  'Модели сейчас недоступны, поэтому отвечаю по простым правилам. Попробуйте чуть позже — подберу точнее.'

/**
 * What came of the photos: `ask` — the message does not say what to do with them (`PHOTO_QUESTION`); `similar` —
 * the hotels like the photo are the `matches`; `refine` — what the photo shows went into the brief; `unseen` — the
 * provider of the models that see photos does not answer; `limited` — over the limit of requests to them; `skipped`
 * — no model that sees photos answered, the message's words were answered without them; `unusable` — they show nothing a hotel is chosen by. `seen` is what the model saw, in Russian; `like` — what the hotels are like it in
 * («вид на море, бассейн»).
 */
export interface PhotoAnswer {
  action: 'ask' | 'similar' | 'refine' | 'unseen' | 'limited' | 'skipped' | 'unusable'
  seen?: string
  like?: string
  /** `similar`: the search by meaning did not answer in time, so no hotels were looked for. */
  missed?: true
}

/** A step of Эвал's turn on the server: one of its agents and what came of it. */
export interface TurnStep {
  /**
   * `search` picks the hotels by meaning, `features` checks their building, noise and views, `vision` looks at the
   * photos (another model when the first failed), `geo` is a call of a geo tool: the places near, a route.
   */
  agent: 'search' | 'features' | 'vision' | 'geo'
  title: string
  /** What the step was called with, briefly in Russian: «Валенсия», «до моря до 1 км · тихо ночью». */
  params?: string
  status: 'done' | 'failed'
  result?: string
}

export interface AssistantResponse {
  brief: Brief
  /** The model's short remark; absent when the rules read the message. */
  reply?: string
  source: 'model' | 'rules'
  /** Hotels the semantic search found for the traveller's words once the brief is complete, best first. */
  matches?: HotelSummary[]
  /** The building, noise and room views of the `matches` that have data. */
  features?: Record<string, HotelFeatures>
  /** The criteria no hotel of the plan's cities has data for: Эвал says so. */
  missing?: Criterion[]
  /** The steps of the turn, in order, once the plan is due. */
  steps?: TurnStep[]
  /**
   * In a chat about a hotel (`brief.hotelId`) `reply` is the answer from the hotel's data and this is the model's
   * part from general knowledge: shown apart, marked «Не проверено».
   */
  unverified?: string
  /** The answer to the photos of the request. */
  photo?: PhotoAnswer
  /** No text model answered, so the rules did: Эвал says so in a message of its own (`MODELS_DOWN`). */
  modelsDown?: true
  /** A chat about a hotel: the map of the places near it the geo steps found. */
  map?: ChatMap
}

/** What Эвал says about a hotel when it cannot answer at all (no network, the route is down). */
export const HOTEL_UNAVAILABLE = 'Сейчас не могу ответить. Попробуйте позже.'

export const MAX_MESSAGE_LENGTH = 500
export const MAX_HISTORY = 20
/**
 * The client's own limit: the route gives the text models 9 s (the rules after that) and answers within 15 s with
 * the semantic search's hotels, when the plan is due.
 */
const ASSISTANT_TIMEOUT_MS = 16_000
/** With photos the route looks at them first (the models in turn, up to 18 s) and answers within 28 s. */
const PHOTO_TIMEOUT_MS = 30_000

const isRecord = (value: unknown): value is Record<string, HotelFeatures> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isCriterion = (value: unknown): value is Criterion =>
  value === 'sea' || value === 'quiet' || value === 'height' || value === 'view'
const isStep = (value: unknown): value is TurnStep =>
  typeof value === 'object' &&
  value !== null &&
  ['search', 'features', 'vision', 'geo'].includes((value as TurnStep).agent) &&
  typeof (value as TurnStep).title === 'string' &&
  ['done', 'failed'].includes((value as TurnStep).status)
/** The known fields of a step only. */
const stepOf = ({ agent, title, params, status, result }: TurnStep): TurnStep => ({
  agent,
  title,
  ...(typeof params === 'string' && params && { params }),
  status,
  ...(typeof result === 'string' && result && { result }),
})
const PHOTO_ACTIONS: readonly PhotoAnswer['action'][] = [
  'ask',
  'similar',
  'refine',
  'unseen',
  'limited',
  'skipped',
  'unusable',
]
const parsePhoto = (value: unknown): PhotoAnswer | undefined => {
  if (typeof value !== 'object' || value === null) return undefined
  const { action, seen, like, missed } = value as Record<string, unknown>
  if (!PHOTO_ACTIONS.includes(action as PhotoAnswer['action'])) return undefined
  return {
    action: action as PhotoAnswer['action'],
    ...(typeof seen === 'string' && seen && { seen }),
    ...(typeof like === 'string' && like && { like }),
    ...(missed === true && { missed: true as const }),
  }
}

/** «Данных о шуме у отелей Праги нет — …»: what Эвал says instead of guessing. */
export function missingNote(missing: readonly Criterion[], cities: readonly Destination[]): string {
  if (missing.length === 0) return ''
  const what = missing.map((c) => CRITERION_LABEL[c]).join(', ')
  const where = cities.length === 1 ? ` у отелей ${cities[0].genitive}` : ' у отелей этих городов'
  return `Данных о ${what}${where} нет — подобрал без этого условия.`
}

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
  const photos = request.photos?.slice(0, MAX_PHOTOS) ?? []
  // No photos, no field: the body stays as small as before.
  const body: AssistantRequest = { ...request, messages, photos: photos.length > 0 ? photos : undefined }
  const timeout = AbortSignal.timeout(photos.length > 0 ? PHOTO_TIMEOUT_MS : ASSISTANT_TIMEOUT_MS)
  let limited = false
  try {
    const response = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (response.ok) {
      const data = (await response.json()) as AssistantResponse
      return {
        brief: normalizeBrief(data.brief ?? {}, destinations),
        reply: typeof data.reply === 'string' ? data.reply : undefined,
        ...(typeof data.unverified === 'string' && data.unverified && { unverified: data.unverified }),
        source: data.source === 'model' ? 'model' : 'rules',
        matches: Array.isArray(data.matches) ? data.matches : undefined,
        ...(isRecord(data.features) && { features: data.features }),
        ...(Array.isArray(data.missing) && { missing: data.missing.filter(isCriterion) }),
        ...(Array.isArray(data.steps) && { steps: data.steps.filter(isStep).map(stepOf) }),
        ...(parsePhoto(data.photo) && { photo: parsePhoto(data.photo) }),
        ...(data.modelsDown === true && { modelsDown: true as const }),
        ...(parseChatMap(data.map) && { map: parseChatMap(data.map) }),
      }
    }
    limited = response.status === 429
  } catch {
    // Falls through to the rules below.
  }
  // A chat about a hotel has no rules of its own here: the hotel's data are on the server.
  if (request.brief.hotelId) return { brief: request.brief, reply: HOTEL_UNAVAILABLE, source: 'rules' }
  // Parameters changed by hand are kept as they are: the plan goes by the rules over them.
  if (request.rerun) return { brief: request.brief, source: 'rules' }
  const input = request.messages.at(-1)?.text ?? ''
  const brief = mergeBrief(request.brief, input, asked, destinations)
  // The rules cannot see photos: Эвал says why instead of pretending.
  const photo: PhotoAnswer = { action: limited ? 'limited' : 'unseen' }
  return { brief, source: 'rules', ...(photos.length > 0 && { photo }) }
}
