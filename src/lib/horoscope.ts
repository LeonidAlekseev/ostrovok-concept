import type { Destination } from '../data/destinations'
import type { Hotel } from './catalog'
import type { IsoDate } from './dates'

/**
 * "Поиск по звёздам": a deterministic reading on the notions of western (tropical) astrology — the sun sign,
 * its element and modality, the Sun and the Moon on the check-in day, the Moon's phase, aspects between
 * signs and the signs of the catalogue's cities. Same input, same reading.
 */

export type Element = 'fire' | 'earth' | 'air' | 'water'
export type Modality = 'cardinal' | 'fixed' | 'mutable'

export interface ZodiacSign {
  id: string
  name: string
  symbol: string
  element: Element
  modality: Modality
  /** Traditional ruler. */
  ruler: string
  /** First day of the sign by tropical dates: [month, day]. */
  start: [number, number]
  /** What the stars say about this sign on the road; `{city}` is replaced with the city. */
  prophecy: string
}

/** In zodiac order from Aries: the index times 30° is the sign's ecliptic longitude. */
export const zodiac: ZodiacSign[] = [
  {
    id: 'aries',
    name: 'Овен',
    symbol: '♈',
    element: 'fire',
    modality: 'cardinal',
    ruler: 'Марс',
    start: [3, 21],
    prophecy: 'Овнам противопоказана скука — {city} разгонит кровь и подарит историю для тостов.',
  },
  {
    id: 'taurus',
    name: 'Телец',
    symbol: '♉',
    element: 'earth',
    modality: 'fixed',
    ruler: 'Венера',
    start: [4, 20],
    prophecy: 'Тельцы знают толк в комфорте: {city} встретит мягкой кроватью и лучшим завтраком сезона.',
  },
  {
    id: 'gemini',
    name: 'Близнецы',
    symbol: '♊',
    element: 'air',
    modality: 'mutable',
    ruler: 'Меркурий',
    start: [5, 21],
    prophecy: 'Близнецам нужно два впечатления в час — {city} справится с этим без перерыва.',
  },
  {
    id: 'cancer',
    name: 'Рак',
    symbol: '♋',
    element: 'water',
    modality: 'cardinal',
    ruler: 'Луна',
    start: [6, 21],
    prophecy: 'Ракам важно чувствовать себя как дома — {city} станет домом хотя бы на неделю.',
  },
  {
    id: 'leo',
    name: 'Лев',
    symbol: '♌',
    element: 'fire',
    modality: 'fixed',
    ruler: 'Солнце',
    start: [7, 23],
    prophecy: 'Львы рождены для сцены: {city} уже готовит вам красную дорожку.',
  },
  {
    id: 'virgo',
    name: 'Дева',
    symbol: '♍',
    element: 'earth',
    modality: 'mutable',
    ruler: 'Меркурий',
    start: [8, 23],
    prophecy: 'Девы любят, когда всё идеально. Звёзды проверили: {city} — без единой ошибки.',
  },
  {
    id: 'libra',
    name: 'Весы',
    symbol: '♎',
    element: 'air',
    modality: 'cardinal',
    ruler: 'Венера',
    start: [9, 23],
    prophecy: 'Весы ищут гармонию — и найдут её в городе {city} где-то между ужином и закатом.',
  },
  {
    id: 'scorpio',
    name: 'Скорпион',
    symbol: '♏',
    element: 'water',
    modality: 'fixed',
    ruler: 'Марс',
    start: [10, 23],
    prophecy: 'Скорпионам по душе тайны: {city} откроет вам пару своих секретов.',
  },
  {
    id: 'sagittarius',
    name: 'Стрелец',
    symbol: '♐',
    element: 'fire',
    modality: 'mutable',
    ruler: 'Юпитер',
    start: [11, 22],
    prophecy: 'Стрельцы созданы для дороги: следующая остановка — {city}.',
  },
  {
    id: 'capricorn',
    name: 'Козерог',
    symbol: '♑',
    element: 'earth',
    modality: 'cardinal',
    ruler: 'Сатурн',
    start: [12, 22],
    prophecy: 'Козероги всегда на вершине — {city} станет следующей.',
  },
  {
    id: 'aquarius',
    name: 'Водолей',
    symbol: '♒',
    element: 'air',
    modality: 'fixed',
    ruler: 'Сатурн',
    start: [1, 20],
    prophecy: 'Водолеи не ходят проторёнными путями — {city} понравится вам именно поэтому.',
  },
  {
    id: 'pisces',
    name: 'Рыбы',
    symbol: '♓',
    element: 'water',
    modality: 'mutable',
    ruler: 'Юпитер',
    start: [2, 19],
    prophecy: 'Рыбы плывут по течению мечты, и течение шепчет: {city}.',
  },
]

export const ELEMENT_LABEL: Record<Element, string> = { fire: 'Огонь', earth: 'Земля', air: 'Воздух', water: 'Вода' }
export const MODALITY_LABEL: Record<Modality, string> = {
  cardinal: 'кардинальный',
  fixed: 'фиксированный',
  mutable: 'мутабельный',
}

const signById = new Map(zodiac.map((z) => [z.id, z]))
const indexOf = (sign: ZodiacSign) => zodiac.indexOf(sign)
const mod = (a: number, n: number) => ((a % n) + n) % n
const dayKey = ([month, day]: [number, number]) => month * 100 + day
const byLatestStart = [...zodiac].sort((a, b) => dayKey(b.start) - dayKey(a.start))

/** Days in a month of a leap year: the birthday has no year, so 29 February is valid. */
export const daysInMonth = (month: number) => new Date(Date.UTC(2000, month, 0)).getUTCDate()

/** Sun sign of a day of the year by tropical dates (Aries 21.03–19.04 … Pisces 19.02–20.03). */
export function sunSign(month: number, day: number): ZodiacSign {
  const key = dayKey([month, day])
  // The latest start not after the day; before 20 January it is still Capricorn, the latest start of all.
  return byLatestStart.find((sign) => dayKey(sign.start) <= key) ?? byLatestStart[0]
}

/** The neighbouring sign when the day is the first or the last day of its sign, in zodiac order. */
export function cuspOf(month: number, day: number): [ZodiacSign, ZodiacSign] | null {
  const sign = sunSign(month, day)
  const i = indexOf(sign)
  if (sign.start[0] === month && sign.start[1] === day) return [zodiac[mod(i - 1, 12)], sign]
  const next = zodiac[mod(i + 1, 12)]
  const nextStart = new Date(Date.UTC(2000, next.start[0] - 1, next.start[1] - 1))
  if (nextStart.getUTCMonth() + 1 === month && nextStart.getUTCDate() === day) return [sign, next]
  return null
}

// ---------------------------------------------------------------------------------------------
// The Moon

const DAY_MS = 86_400_000
/** J2000.0: 2000-01-01 12:00 (TT; the difference from UTC does not matter at this precision). */
const J2000 = Date.UTC(2000, 0, 1, 12)
/** Reference new moon: 2000-01-06 18:14 UTC. */
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)
export const SYNODIC_MONTH = 29.530588853

/** Noon UTC of a date: the reading looks at the middle of the check-in day. */
const noonOf = (iso: IsoDate) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 12)
}

/**
 * Ecliptic longitude of the Moon at a moment (ms since the epoch), degrees: the mean longitude plus the main
 * term of the equation of centre. Good to about 1–2° — enough to name the sign, except near its edge.
 */
export function moonLongitude(time: number): number {
  const d = (time - J2000) / DAY_MS
  const meanLongitude = 218.316 + 13.176396 * d
  const meanAnomaly = ((134.963 + 13.064993 * d) * Math.PI) / 180
  return mod(meanLongitude + 6.289 * Math.sin(meanAnomaly), 360)
}

export const moonSign = (iso: IsoDate): ZodiacSign => zodiac[Math.floor(moonLongitude(noonOf(iso)) / 30)]

export const MOON_PHASES = [
  'Новолуние',
  'Растущий серп',
  'Первая четверть',
  'Растущая Луна',
  'Полнолуние',
  'Убывающая Луна',
  'Последняя четверть',
  'Убывающий серп',
] as const

export interface MoonPhase {
  /** 0 is the new moon, 4 the full moon. */
  index: number
  name: (typeof MOON_PHASES)[number]
  /** Days since the new moon. */
  age: number
  waxing: boolean
}

/** One of 8 phases by the Moon's mean age since the reference new moon. */
export function moonPhase(iso: IsoDate): MoonPhase {
  const age = mod((noonOf(iso) - NEW_MOON) / DAY_MS, SYNODIC_MONTH)
  const index = Math.floor((age / SYNODIC_MONTH) * 8 + 0.5) % 8
  // The new moon opens the waxing half, the full moon the waning one.
  return { index, name: MOON_PHASES[index], age, waxing: index < 4 }
}

// ---------------------------------------------------------------------------------------------
// Aspects

export type AspectKind = 'conjunction' | 'sextile' | 'square' | 'trine' | 'opposition'

export const ASPECT_LABEL: Record<AspectKind, string> = {
  conjunction: 'Соединение',
  sextile: 'Секстиль',
  square: 'Квадрат',
  trine: 'Трин',
  opposition: 'Оппозиция',
}

/** Major aspects by the distance between signs, 30° each; 30° and 150° are not major. */
const ASPECT_BY_STEPS: Record<number, AspectKind> = {
  0: 'conjunction',
  2: 'sextile',
  3: 'square',
  4: 'trine',
  6: 'opposition',
}

const ASPECT_WEIGHT: Record<AspectKind, number> = { trine: 3, sextile: 2, conjunction: 2, square: -1, opposition: -2 }

export function aspectBetween(a: ZodiacSign, b: ZodiacSign): AspectKind | null {
  const steps = Math.abs(indexOf(a) - indexOf(b))
  return ASPECT_BY_STEPS[Math.min(steps, 12 - steps)] ?? null
}

const weightOf = (aspect: AspectKind | null) => (aspect ? ASPECT_WEIGHT[aspect] : 0)

/** For a companion, opposites attract. */
const companionWeight = (aspect: AspectKind | null) => (aspect === 'opposition' ? 1 : weightOf(aspect))

// ---------------------------------------------------------------------------------------------
// Astrological geography

/**
 * Ruling sign of each catalogue city. Traditional attributions where they are known (W. Lilly, "Christian
 * Astrology", 1647, after Ptolemy and the medieval tables); otherwise by the element of the city's first
 * scenario — sea: water, weekend: fire, Europe: air, none: earth — taking that element's signs in turn.
 */
export const citySigns: Record<string, string> = {
  prague: 'aries', // weekend: fire
  paris: 'virgo', // Lilly
  london: 'gemini', // Lilly
  oslo: 'libra', // Europe: air
  stockholm: 'aquarius', // Europe: air
  helsinki: 'gemini', // Europe: air
  florence: 'aries', // Lilly
  rome: 'leo', // Lilly
  madrid: 'libra', // Europe: air
  barcelona: 'cancer', // sea: water
  lisbon: 'scorpio', // sea: water
  athens: 'pisces', // sea: water
  zakynthos: 'cancer', // sea: water
  istanbul: 'leo', // weekend: fire
  antalya: 'scorpio', // sea: water
  sochi: 'pisces', // sea: water
  kaliningrad: 'sagittarius', // weekend: fire
  tbilisi: 'aries', // weekend: fire
  reykjavik: 'taurus', // no scenario: earth
  'new-york': 'virgo', // no scenario: earth
  miami: 'cancer', // sea: water
  'los-angeles': 'scorpio', // sea: water
  vancouver: 'capricorn', // no scenario: earth
  cancun: 'pisces', // sea: water
  honolulu: 'cancer', // sea: water
  marrakesh: 'leo', // weekend: fire
  cairo: 'taurus', // no scenario: earth
  dubai: 'scorpio', // sea: water
  almaty: 'sagittarius', // weekend: fire
  delhi: 'virgo', // no scenario: earth
  beijing: 'capricorn', // no scenario: earth
  seoul: 'taurus', // no scenario: earth
  vladivostok: 'pisces', // sea: water
  tokyo: 'virgo', // no scenario: earth
  valencia: 'cancer', // sea: water
}

export const citySign = (city: Destination): ZodiacSign => signById.get(citySigns[city.id])!

// ---------------------------------------------------------------------------------------------
// The reading

export type Company = 'solo' | 'pair' | 'group'

export interface ReadingInput {
  name: string
  birthMonth: number
  birthDay: number
  checkIn: IsoDate
  company: Company
  /** Only for a pair; optional. */
  partnerSignId?: string
  /** Where to: a side of the world, or a country and maybe its city; without them, the whole catalogue. */
  direction?: Direction
  country?: string
  destinationId?: string
}

export type Direction = 'north' | 'south' | 'east' | 'west'

/**
 * The sides of the world as seen from Moscow, generous so that each has several cities: the north is the
 * latitude of Moscow and above (Scandinavia, Iceland, Kaliningrad), the south is from the Black Sea down, the
 * east and the west are by longitude. A city may be on two sides: Lisbon is both south and west.
 */
const FROM = { lat: 55.76, lon: 37.62 }
const SIDES: Record<Direction, (city: Destination) => boolean> = {
  north: (city) => city.lat >= FROM.lat - 2,
  south: (city) => city.lat <= FROM.lat - 12,
  east: (city) => city.lon >= FROM.lon + 2,
  west: (city) => city.lon <= FROM.lon - 12,
}

/** The cities the stars choose from: the chosen city, country or side; all of them if nothing fits. */
export function destinationsFor(
  { direction, country, destinationId }: Pick<ReadingInput, 'direction' | 'country' | 'destinationId'>,
  destinations: readonly Destination[],
): readonly Destination[] {
  const fits = destinations.filter((city) =>
    destinationId
      ? city.id === destinationId
      : country
        ? city.country === country
        : direction
          ? SIDES[direction](city)
          : true,
  )
  return fits.length > 0 ? fits : destinations
}

export interface Reading {
  sign: ZodiacSign
  /** Sign of the Sun on the check-in day. */
  sunTransit: ZodiacSign
  moon: { sign: ZodiacSign; phase: MoonPhase }
  city: Destination
  citySign: ZodiacSign
  /** The aspect between the natal Sun and the city's sign. */
  aspect: AspectKind | null
  /**
   * The best hotel of the best city, then the best of the 2nd and the 3rd cities; the result shows the first,
   * which is of the next city when the best one has no hotels.
   */
  hotels: Hotel[]
  forecast: string
}

/** Active elements suit new places (the waxing Moon), calm ones rest (the waning Moon). */
const ACTIVE: Element[] = ['fire', 'air']

const ELEMENT_LINE: Record<Element, string> = {
  fire: 'Огненным знакам нужен драйв — берите билеты без долгих раздумий.',
  earth: 'Земным знакам важен комфорт — хороший завтрак засчитывается как знак свыше.',
  air: 'Воздушным знакам нужны новые лица и разговоры до ночи.',
  water: 'Водным знакам нужны тишина и вид, от которого замирает сердце.',
}

const ASPECT_LINE: Record<AspectKind | 'none', string> = {
  conjunction: 'Ваш знак и знак города совпадают: {city} говорит с вами на одном языке.',
  trine: 'Трин со знаком города: {city} даётся легко, будто вы там уже бывали.',
  sextile: 'Секстиль со знаком города обещает приятные знакомства.',
  square: 'Квадрат со знаком города добавит перчинки — держите план гибким.',
  opposition: 'Оппозиция со знаком города: {city} покажет вам другую сторону себя.',
  none: 'Ваш знак и знак города держат нейтралитет — остальное решат Луна и Солнце.',
}

export const lowerFirst = (text: string) => text.charAt(0).toLocaleLowerCase('ru') + text.slice(1)

/** Ranks the `destinations` for the traveller and picks the best rated of their `hotels` in the top three. */
export function readStars(
  input: ReadingInput,
  destinations: readonly Destination[],
  hotels: readonly Hotel[],
): Reading {
  const sign = sunSign(input.birthMonth, input.birthDay)
  const sunTransit = sunSign(Number(input.checkIn.slice(5, 7)), Number(input.checkIn.slice(8, 10)))
  const moon = { sign: moonSign(input.checkIn), phase: moonPhase(input.checkIn) }
  const partner = input.company === 'pair' && input.partnerSignId ? signById.get(input.partnerSignId) : undefined

  const score = (city: Destination) => {
    const target = citySign(city)
    const calm = !ACTIVE.includes(target.element)
    return (
      weightOf(aspectBetween(sign, target)) +
      weightOf(aspectBetween(moon.sign, target)) +
      weightOf(aspectBetween(sunTransit, target)) / 2 +
      (moon.phase.waxing !== calm ? 1 : 0) +
      (partner ? companionWeight(aspectBetween(partner, target)) : 0)
    )
  }
  // A stable sort keeps the catalogue order among equal scores.
  const ranked = destinationsFor(input, destinations)
    .map((city) => ({ city, score: score(city) }))
    .sort((a, b) => b.score - a.score)
    .map((r) => r.city)
  // The best hotel of each of the three best cities (a city without hotels gives none); with fewer cities
  // (a city or a small country was chosen), the next best hotels of those cities fill the three places.
  const hotelsIn = (city: Destination) =>
    hotels.filter((h) => h.destinationId === city.id).sort((a, b) => b.rating - a.rating)
  const picks = ranked.slice(0, 3).flatMap((c) => hotelsIn(c).slice(0, 1))
  for (const hotel of ranked.flatMap(hotelsIn)) {
    if (picks.length >= 3) break
    if (!picks.includes(hotel)) picks.push(hotel)
  }

  const city = ranked[0]
  const target = citySign(city)
  const aspect = aspectBetween(sign, target)
  const forecast = [
    `${input.name.trim()}, ${lowerFirst(sign.prophecy)}`,
    ASPECT_LINE[aspect ?? 'none'],
    ELEMENT_LINE[sign.element],
    `${moon.phase.name} — ${moon.phase.waxing ? 'время новых мест' : 'время отдыха и неспешных прогулок'}.`,
  ]
    .join(' ')
    .replaceAll('{city}', city.name)

  return {
    sign,
    sunTransit,
    moon,
    city,
    citySign: target,
    aspect,
    hotels: picks,
    forecast,
  }
}
