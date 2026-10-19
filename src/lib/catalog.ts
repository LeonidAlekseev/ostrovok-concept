import { destinations, type Destination } from '../data/destinations'
import { newHotelSeeds, type HotelSeed } from '../data/hotels'
import { addDays, type IsoDate } from './dates'

/**
 * Demo hotel catalogue. There is no backend: every city gets the hand-picked seeds from
 * src/data/hotels.ts plus generated hotels, and rooms, rates and reviews are generated too.
 * Generation is seeded by the hotel id, so the catalogue is the same on every build, on the
 * server and in the browser. Summaries are built eagerly (they are cheap and the home page
 * needs them); the full hotel is built on first request.
 */

export type Meal = 'none' | 'breakfast' | 'half-board' | 'full-board' | 'all-inclusive'
export type Payment = 'now' | 'at-hotel'
/** Free cancellation until `daysBefore` days before check-in, or no refund at all. */
export type Cancellation = { kind: 'free'; daysBefore: number } | { kind: 'non-refundable' }

export const MEAL_LABEL: Record<Meal, string> = {
  none: 'Без питания',
  breakfast: 'Завтрак включён',
  'half-board': 'Полупансион',
  'full-board': 'Полный пансион',
  'all-inclusive': 'Всё включено',
}

export const PAYMENT_LABEL: Record<Payment, string> = { now: 'Оплата сейчас', 'at-hotel': 'Оплата в отеле' }

export const AMENITY_LABEL = {
  wifi: 'Бесплатный Wi‑Fi',
  'front-desk': 'Круглосуточная стойка регистрации',
  'air-conditioning': 'Кондиционер',
  restaurant: 'Ресторан',
  bar: 'Бар',
  parking: 'Парковка',
  pool: 'Бассейн',
  spa: 'Спа',
  gym: 'Фитнес-центр',
  shuttle: 'Трансфер из аэропорта',
  pets: 'Можно с питомцами',
  family: 'Семейные номера',
} as const

export type Amenity = keyof typeof AMENITY_LABEL

/** A photo placeholder: no image files, only a caption and one of the gradient tones. */
export interface Photo {
  id: string
  caption: string
  /** Index into PHOTO_TONES of the placeholder. */
  tone: number
}

export const PHOTO_TONE_COUNT = 4

export interface Rate {
  /** Unique within its room. */
  id: string
  meal: Meal
  cancellation: Cancellation
  payment: Payment
  /** Price of one room for one night, ₽. */
  pricePerNight: number
}

export interface Room {
  /** Unique within its hotel. */
  id: string
  name: string
  /** m². */
  area: number
  beds: string
  /** Guests one room sleeps. */
  capacity: number
  photos: Photo[]
  /** Cheapest first. */
  rates: Rate[]
}

export interface Review {
  id: string
  author: string
  date: IsoDate
  /** 1…10. */
  score: number
  text: string
}

export interface HotelSummary {
  /** Stable slug: `<destinationId>-<name>`, e.g. `prague-old-town-lantern`. */
  id: string
  destinationId: string
  name: string
  stars: 1 | 2 | 3 | 4 | 5
  /** Guest rating, 0…10. */
  rating: number
  reviewCount: number
  /** Cheapest rate per night, ₽. */
  priceFrom: number
  /** One of the hand-picked "recently added" hotels the hero globe spotlights. */
  isNew: boolean
}

export interface Hotel extends HotelSummary {
  address: string
  lat: number
  lon: number
  /** Straight-line distance to the city centre, km. */
  distanceKm: number
  amenities: Amenity[]
  description: string
  checkInTime: string
  checkOutTime: string
  photos: Photo[]
  /** Cheapest first. */
  rooms: Room[]
  /** A sample of the reviews, newest first; `reviewCount` is the total. */
  reviews: Review[]
}

// ---------------------------------------------------------------------------------------------
// Seeded randomness

function hashString(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** mulberry32: a small fast PRNG, good enough for demo data. */
function seeded(key: string) {
  let state = hashString(key)
  const next = () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]
  /** `count` distinct items in their original order. */
  const sample = <T>(list: readonly T[], count: number): T[] => {
    const chosen = new Set<number>()
    while (chosen.size < Math.min(count, list.length)) chosen.add(Math.floor(next() * list.length))
    return list.filter((_, i) => chosen.has(i))
  }
  return { next, int, pick, sample }
}

const roundUp100 = (value: number) => Math.ceil(value / 100) * 100
const round1 = (value: number) => Math.round(value * 10) / 10

// ---------------------------------------------------------------------------------------------
// Ids

const CYRILLIC_LETTERS = [...'абвгдеёжзийклмнопрстуфхцчшщъыьэюя']
const CYRILLIC_LATIN = 'a b v g d e e zh z i y k l m n o p r s t u f kh ts ch sh sch - y - e yu ya'.split(' ')
const TRANSLIT: Record<string, string> = {
  ...Object.fromEntries(CYRILLIC_LETTERS.map((ch, i) => [ch, CYRILLIC_LATIN[i] === '-' ? '' : CYRILLIC_LATIN[i]])),
  ø: 'o',
  æ: 'ae',
  ß: 'ss',
  ł: 'l',
}

/** "Grünerløkka Studios" → "grunerlokka-studios", "Золотой Рог" → "zolotoy-rog". */
export function slugify(text: string): string {
  return [...text.toLocaleLowerCase('ru')]
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// ---------------------------------------------------------------------------------------------
// Summaries

/** Every city has at least this many hotels. */
export const MIN_HOTELS_PER_DESTINATION = 6

const NAME_FIRST = [
  'Central',
  'Garden',
  'Harbour',
  'Royal',
  'Urban',
  'Riverside',
  'Park',
  'Old Quarter',
  'Skyline',
  'Boulevard',
  'Courtyard',
  'Market Square',
  'Grand',
  'Corner',
  'Sunrise',
  'Panorama',
]
const NAME_SECOND = ['Hotel', 'Suites', 'Inn', 'Residence', 'House', 'Rooms', 'Lofts', 'Lodge', 'Boutique Hotel']
const NAMES_RU = ['Бриз', 'Лазурь', 'Магнолия', 'Парк Отель', 'Янтарь', 'Маяк', 'Горизонт', 'Причал', 'Ривьера', 'Дюны']
const GENERATED_STARS = [2, 3, 3, 3, 4, 4, 4, 5] as const

const idOf = (destinationId: string, name: string) => `${destinationId}-${slugify(name)}`

const summaryOf = (seed: HotelSeed, reviewCount: number, isNew: boolean): HotelSummary => ({
  id: idOf(seed.destinationId, seed.name),
  ...seed,
  reviewCount,
  isNew,
})

function generateSeeds(destination: Destination, taken: HotelSeed[], count: number): HotelSeed[] {
  const rng = seeded(`generated:${destination.id}`)
  const names = new Set(taken.map((h) => h.name))
  // A city without seeds still has to offer its advertised minimum price.
  let cheapestLeft = !taken.some((h) => h.priceFrom === destination.priceFrom)
  const seeds: HotelSeed[] = []
  while (seeds.length < count) {
    const name =
      destination.country === 'Россия' ? rng.pick(NAMES_RU) : `${rng.pick(NAME_FIRST)} ${rng.pick(NAME_SECOND)}`
    if (names.has(name)) continue
    names.add(name)
    const stars = rng.pick(GENERATED_STARS)
    const priceFrom = cheapestLeft
      ? destination.priceFrom
      : roundUp100(destination.priceFrom * (1.04 + rng.next() * 0.4) * (1 + Math.max(0, stars - 3) * 0.35))
    cheapestLeft = false
    const rating = Math.min(9.8, round1(7.8 + rng.next() * 1.4 + (stars - 3) * 0.15))
    seeds.push({ destinationId: destination.id, name, stars, rating, priceFrom })
  }
  return seeds
}

const reviewCountOf = (id: string) => seeded(`reviews:${id}`).int(40, 1400)

function buildSummaries() {
  const all: HotelSummary[] = []
  const fromSeed = new Map<HotelSeed, HotelSummary>()
  for (const destination of destinations) {
    const own = newHotelSeeds.filter((h) => h.destinationId === destination.id)
    for (const seed of own) {
      const summary = summaryOf(seed, reviewCountOf(idOf(seed.destinationId, seed.name)), true)
      fromSeed.set(seed, summary)
      all.push(summary)
    }
    const extra = generateSeeds(destination, own, Math.max(0, MIN_HOTELS_PER_DESTINATION - own.length))
    for (const seed of extra) all.push(summaryOf(seed, reviewCountOf(idOf(seed.destinationId, seed.name)), false))
  }
  return { all, newOnes: newHotelSeeds.map((seed) => fromSeed.get(seed)!) }
}

const summaries = buildSummaries()

/** All hotels, grouped by city in the order of `destinations`. */
export const hotels: HotelSummary[] = summaries.all
/** The hand-picked "recently added" hotels, in their original order. */
export const newHotels: HotelSummary[] = summaries.newOnes

const summaryById = new Map(hotels.map((h) => [h.id, h]))

export const getDestination = (id: string): Destination | undefined => destinations.find((d) => d.id === id)

export const hotelsIn = (destinationId: string): HotelSummary[] =>
  hotels.filter((h) => h.destinationId === destinationId)

// ---------------------------------------------------------------------------------------------
// Full hotels

const DISTRICTS = ['Старый город', 'Центр', 'Набережная', 'Парковый квартал', 'Деловой район', 'Исторический центр']
const DESCRIPTION_ROOMS = [
  'Номера оформлены в спокойных тонах, в каждом есть рабочее место и кондиционер.',
  'Гостей ждут просторные номера с большими окнами и удобными кроватями.',
  'Рядом — кафе, магазины и остановки общественного транспорта.',
]
const DESCRIPTION_SERVICE = [
  'На стойке регистрации подскажут маршруты и забронируют экскурсии.',
  'Утром в ресторане сервируют завтрак, вечером работает бар.',
  'Отель подходит и для деловых поездок, и для отдыха с семьёй.',
]
const OPTIONAL_AMENITIES: Amenity[] = [
  'air-conditioning',
  'restaurant',
  'bar',
  'parking',
  'pool',
  'spa',
  'gym',
  'shuttle',
  'pets',
  'family',
]
const HOTEL_PHOTOS = ['Фасад', 'Лобби', 'Ресторан', 'Терраса', 'Вид из окна']

const ROOM_TYPES = [
  { id: 'standard', name: 'Стандартный номер', area: [16, 22], beds: '1 двуспальная кровать', capacity: 2, factor: 1 },
  {
    id: 'twin',
    name: 'Стандартный с двумя кроватями',
    area: [18, 24],
    beds: '2 односпальные кровати',
    capacity: 2,
    factor: 1.05,
  },
  { id: 'superior', name: 'Улучшенный номер', area: [22, 28], beds: '1 двуспальная кровать', capacity: 2, factor: 1.3 },
  { id: 'family', name: 'Семейный номер', area: [30, 40], beds: '2 двуспальные кровати', capacity: 4, factor: 1.7 },
  {
    id: 'junior-suite',
    name: 'Полулюкс',
    area: [34, 44],
    beds: '1 двуспальная кровать и диван',
    capacity: 3,
    factor: 2,
  },
  { id: 'suite', name: 'Люкс', area: [45, 70], beds: '1 кровать king-size и диван', capacity: 3, factor: 2.8 },
] as const

const RATE_TYPES: (Omit<Rate, 'pricePerNight'> & { factor: number })[] = [
  { id: 'basic', meal: 'none', cancellation: { kind: 'non-refundable' }, payment: 'now', factor: 1 },
  { id: 'flex', meal: 'none', cancellation: { kind: 'free', daysBefore: 1 }, payment: 'at-hotel', factor: 1.1 },
  { id: 'breakfast', meal: 'breakfast', cancellation: { kind: 'free', daysBefore: 3 }, payment: 'now', factor: 1.15 },
  {
    id: 'half-board',
    meal: 'half-board',
    cancellation: { kind: 'free', daysBefore: 7 },
    payment: 'at-hotel',
    factor: 1.35,
  },
  { id: 'full-board', meal: 'full-board', cancellation: { kind: 'non-refundable' }, payment: 'now', factor: 1.5 },
  {
    id: 'all-inclusive',
    meal: 'all-inclusive',
    cancellation: { kind: 'free', daysBefore: 5 },
    payment: 'now',
    factor: 1.7,
  },
]

const REVIEW_AUTHORS = [
  'Анна К.',
  'Дмитрий С.',
  'Екатерина М.',
  'Иван П.',
  'Мария Л.',
  'Алексей Н.',
  'Ольга В.',
  'Сергей Т.',
  'Наталья Р.',
  'Павел Б.',
  'Юлия Г.',
  'Михаил Д.',
]
const REVIEW_TEXTS = {
  high: [
    'Отличное расположение, до главных мест можно дойти пешком.',
    'Очень чистый номер и удобная кровать.',
    'Персонал помог с поздним заездом и вызвал такси.',
    'Завтраки разнообразные, кофе отличный.',
    'Обязательно вернёмся сюда снова.',
  ],
  mid: [
    'Хороший отель за свои деньги.',
    'Номер небольшой, но уютный.',
    'Wi‑Fi иногда пропадал, в остальном всё хорошо.',
    'Вечером шумновато, зато центр рядом.',
  ],
  low: ['Номер не соответствовал фотографиям.', 'Долго ждали заселения.', 'Кондиционер работал плохо.'],
}
/** Reviews are dated back from a fixed day: the catalogue must not depend on the build date. */
const REVIEWS_UNTIL: IsoDate = '2026-09-30'

const KM_PER_DEGREE = 111.32

function buildHotel(summary: HotelSummary): Hotel {
  const rng = seeded(`hotel:${summary.id}`)
  const destination = getDestination(summary.destinationId)!
  const photo = (id: string, caption: string): Photo => ({ id, caption, tone: rng.int(0, PHOTO_TONE_COUNT - 1) })

  const distanceKm = round1(0.3 + rng.next() * 4.7)
  const angle = rng.next() * 2 * Math.PI
  const lat = destination.lat + (distanceKm * Math.sin(angle)) / KM_PER_DEGREE
  const lon =
    destination.lon + (distanceKm * Math.cos(angle)) / (KM_PER_DEGREE * Math.cos((destination.lat * Math.PI) / 180))
  const district = rng.pick(DISTRICTS)

  const amenities: Amenity[] = [
    'wifi',
    'front-desk',
    ...rng.sample(OPTIONAL_AMENITIES, rng.int(2, 3) + Math.max(0, summary.stars - 2)),
  ]

  const roomTypes = [ROOM_TYPES[0], ...rng.sample(ROOM_TYPES.slice(1), rng.int(2, ROOM_TYPES.length - 1))]
  const rooms = roomTypes.map((type, index): Room => {
    // Every room has its own cheapest rate; the first room's cheapest rate is the hotel's `priceFrom`.
    const base = index === 0 ? summary.priceFrom : roundUp100(summary.priceFrom * type.factor)
    const rateTypes = rng.sample(RATE_TYPES, rng.int(1, 4))
    const cheapest = rateTypes[0].factor
    return {
      id: type.id,
      name: type.name,
      area: rng.int(type.area[0], type.area[1]),
      beds: type.beds,
      capacity: type.capacity,
      photos: [photo(`${type.id}-1`, type.name), photo(`${type.id}-2`, 'Ванная комната')],
      rates: rateTypes.map(({ factor, ...rate }) => ({
        ...rate,
        pricePerNight: factor === cheapest ? base : roundUp100((base * factor) / cheapest),
      })),
    }
  })

  const reviews = Array.from({ length: rng.int(5, 20) }, (_, i): Review => {
    const score = Math.max(4, Math.min(10, round1(summary.rating + (rng.next() - 0.65) * 3)))
    const texts = REVIEW_TEXTS[score >= 9 ? 'high' : score >= 7 ? 'mid' : 'low']
    return {
      id: `${summary.id}-review-${i + 1}`,
      author: rng.pick(REVIEW_AUTHORS),
      date: addDays(REVIEWS_UNTIL, -rng.int(0, 540)),
      score,
      text: rng.sample(texts, rng.int(1, 2)).join(' '),
    }
  }).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))

  const distance = `${distanceKm.toLocaleString('ru-RU')} км`
  return {
    ...summary,
    address: `${destination.name}, ${district}, д. ${rng.int(1, 120)}`,
    lat: Math.round(lat * 1e4) / 1e4,
    lon: Math.round(lon * 1e4) / 1e4,
    distanceKm,
    amenities,
    description: [
      `${summary.name} — ${summary.stars}-звёздочный отель в районе «${district}», в ${distance} от центра.`,
      rng.pick(DESCRIPTION_ROOMS),
      rng.pick(DESCRIPTION_SERVICE),
    ].join(' '),
    checkInTime: '14:00',
    checkOutTime: '12:00',
    photos: HOTEL_PHOTOS.map((caption, i) => photo(`photo-${i + 1}`, caption)),
    rooms,
    reviews,
  }
}

const built = new Map<string, Hotel>()

/** The full hotel, or `undefined` for an unknown id. */
export function getHotel(id: string): Hotel | undefined {
  const summary = summaryById.get(id)
  if (!summary) return undefined
  let hotel = built.get(id)
  if (!hotel) built.set(id, (hotel = buildHotel(summary)))
  return hotel
}

/** Full hotels of a city. */
export const fullHotelsIn = (destinationId: string): Hotel[] => hotelsIn(destinationId).map((h) => getHotel(h.id)!)

/** Builds the whole catalogue from scratch, bypassing the cache. */
export const buildCatalog = (): Hotel[] => buildSummaries().all.map(buildHotel)

export const findRoom = (hotel: Hotel, roomId: string) => hotel.rooms.find((r) => r.id === roomId)
export const findRate = (room: Room, rateId: string) => room.rates.find((r) => r.id === rateId)

/** The hotel's cheapest rate and its room. */
export function cheapestRate(hotel: Hotel): { room: Room; rate: Rate } {
  let best = { room: hotel.rooms[0], rate: hotel.rooms[0].rates[0] }
  for (const room of hotel.rooms)
    for (const rate of room.rates) if (rate.pricePerNight < best.rate.pricePerNight) best = { room, rate }
  return best
}
