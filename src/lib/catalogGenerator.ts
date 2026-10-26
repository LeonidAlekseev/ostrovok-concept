import { z } from 'zod'
import { destinations, type Destination } from '../data/destinations'
import extraHotelData from '../data/extraHotels.json' with { type: 'json' }
import { newHotelSeeds, type HotelSeed } from '../data/hotels'
import {
  AMENITIES,
  PHOTO_TONE_COUNT,
  roundUp100,
  SCORE_SECTIONS,
  type Amenity,
  type Hotel,
  type HotelSummary,
  type NearestStation,
  type Photo,
  type Rate,
  type Review,
  type Room,
  type SectionScore,
  type StayType,
} from './catalog'
import { addDays, type IsoDate } from './dates'

/**
 * The demo catalogue generator: every city gets the hand-picked seeds from src/data/hotels.ts plus
 * generated hotels, and rooms, rates and reviews are generated too. Generation is seeded by the hotel
 * id, so the catalogue is the same on every run. It feeds `npm run db:seed` and the tests; the site
 * reads the catalogue from Supabase (src/lib/db/catalog.ts), so this module stays out of the bundles.
 */

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

/** Wi‑Fi speed range, Мбит/с, and the share with a workspace of each kind of stay. */
const WIFI_MBPS: Record<StayType, [number, number]> = {
  hotel: [50, 300],
  hostel: [30, 100],
  apartments: [100, 500],
  villa: [50, 200],
}
const WORKSPACE_SHARE: Record<StayType, number> = { hotel: 0.35, hostel: 0, apartments: 0.6, villa: 0 }

/** Wi‑Fi speed to 10 Мбит/с and the workspace: a seed of their own, so the rest of the hotel stays as it was. */
export function workTraits(id: string, type: StayType) {
  const rng = seeded(`work:${id}`)
  const [min, max] = WIFI_MBPS[type]
  return { wifiMbps: Math.round(rng.int(min, max) / 10) * 10, workspace: rng.next() < WORKSPACE_SHARE[type] }
}

const summaryOf = (
  seed: HotelSeed,
  reviewCount: number,
  isNew: boolean,
  stayType: StayType = 'hotel',
  work: Partial<Pick<HotelSummary, 'wifiMbps' | 'workspace'>> = {},
): HotelSummary => {
  const id = idOf(seed.destinationId, seed.name)
  return { id, ...seed, stayType, ...workTraits(id, stayType), ...work, reviewCount, isNew }
}

/**
 * A place the language model once proposed for a city that had none of its kind: it is kept in
 * src/data/extraHotels.json and joins the catalogue after the generated stays.
 */
export const extraHotelSchema = z.object({
  destinationId: z.string().min(1),
  name: z.string().min(2).max(60),
  stayType: z.enum(['hotel', 'hostel', 'apartments', 'villa']),
  stars: z.number().int().min(1).max(5),
  rating: z.number().min(6).max(9.9),
  priceFrom: z.number().int().positive(),
  wifiMbps: z.number().int().min(10).max(1000).optional(),
  workspace: z.boolean().optional(),
})
export type ExtraHotel = z.infer<typeof extraHotelSchema>

/** The extra hotels of the file, checked: a known city, a price not below the city's minimum. */
export function parseExtraHotels(data: unknown): ExtraHotel[] {
  return z
    .array(extraHotelSchema)
    .parse(data)
    .map((extra) => {
      const destination = destinations.find((d) => d.id === extra.destinationId)
      if (!destination) throw new Error(`extraHotels: города ${extra.destinationId} нет в каталоге`)
      const [min, max] = WIFI_MBPS[extra.stayType]
      if (extra.wifiMbps !== undefined && (extra.wifiMbps < min || extra.wifiMbps > max || extra.wifiMbps % 10))
        throw new Error(`extraHotels: Wi‑Fi ${extra.name} вне ${min}–${max} Мбит/с или не кратен 10`)
      if (extra.workspace && !WORKSPACE_SHARE[extra.stayType])
        throw new Error(`extraHotels: у ${extra.name} (${extra.stayType}) не бывает рабочего места`)
      if (extra.priceFrom < destination.priceFrom)
        throw new Error(`extraHotels: ${extra.name} дешевле минимальной цены города ${destination.name}`)
      return extra
    })
}

const extraHotels = parseExtraHotels(extraHotelData)

/** Every city has this many of each of its extra stays: hostels, apartments and villas. */
export const STAYS_PER_DESTINATION: Record<Exclude<StayType, 'hotel'>, number> = { hostel: 2, apartments: 2, villa: 1 }

const STAY_NAMES = {
  hostel: { ru: ['Попутчик', 'Рюкзак', 'Станция', 'Гнездо', 'Перекрёсток', 'Привал'], foreign: 'Hostel' },
  apartments: { ru: ['Сити', 'Лофт', 'Уют', 'Центр', 'Набережная', 'Двор'], foreign: 'Apartments' },
  villa: { ru: ['Эдельвейс', 'Олива', 'Кипарис', 'Заря', 'Сосны', 'Лагуна'], foreign: 'Villa' },
} as const
const VILLA_NAMES = ['Aurora', 'Bella', 'Serena', 'Solara', 'Mira', 'Oliva']
const STAY_RU_PREFIX = { hostel: 'Хостел', apartments: 'Апартаменты', villa: 'Вилла' } as const

/**
 * The rating, the price of the cheapest night against the city's advertised minimum and the stars of each
 * extra kind. Hostels cost the least, villas the most; apartments and villas keep a star value only for the
 * table and the sorting (see `hasStars`). No price is below the city's minimum: it stays the cheapest hotel's.
 */
const STAY_PROFILE = {
  hostel: { rating: [7.6, 9], price: [1, 1.15], stars: [1, 2] },
  apartments: { rating: [8, 9.4], price: [1.1, 1.5], stars: [3, 3] },
  villa: { rating: [8.6, 9.7], price: [2.2, 3.2], stars: [4, 4] },
} as const

function generateStays(destination: Destination, taken: HotelSeed[]): (HotelSeed & { stayType: StayType })[] {
  const names = new Set(taken.map((h) => h.name))
  const stays: (HotelSeed & { stayType: StayType })[] = []
  for (const stayType of ['hostel', 'apartments', 'villa'] as const) {
    const rng = seeded(`stay:${stayType}:${destination.id}`)
    const profile = STAY_PROFILE[stayType]
    for (let made = 0; made < STAYS_PER_DESTINATION[stayType];) {
      const ru = destination.country === 'Россия'
      const name = ru
        ? `${STAY_RU_PREFIX[stayType]} ${rng.pick(STAY_NAMES[stayType].ru)}`
        : stayType === 'villa'
          ? `Villa ${rng.pick(VILLA_NAMES)}`
          : `${rng.pick(NAME_FIRST)} ${STAY_NAMES[stayType].foreign}`
      if (names.has(name)) continue
      names.add(name)
      made++
      stays.push({
        stayType,
        destinationId: destination.id,
        name,
        stars: rng.pick(profile.stars as readonly (1 | 2 | 3 | 4)[]),
        rating: round1(profile.rating[0] + rng.next() * (profile.rating[1] - profile.rating[0])),
        priceFrom: roundUp100(
          destination.priceFrom * (profile.price[0] + rng.next() * (profile.price[1] - profile.price[0])),
        ),
      })
    }
  }
  return stays
}

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
  for (const destination of destinations.filter((d) => !d.real)) {
    const own = newHotelSeeds.filter((h) => h.destinationId === destination.id)
    for (const seed of own) {
      const summary = summaryOf(seed, reviewCountOf(idOf(seed.destinationId, seed.name)), true)
      fromSeed.set(seed, summary)
      all.push(summary)
    }
    const extra = generateSeeds(destination, own, Math.max(0, MIN_HOTELS_PER_DESTINATION - own.length))
    for (const seed of extra) all.push(summaryOf(seed, reviewCountOf(idOf(seed.destinationId, seed.name)), false))
    for (const { stayType, ...seed } of generateStays(destination, [...own, ...extra]))
      all.push(summaryOf(seed, reviewCountOf(idOf(seed.destinationId, seed.name)), false, stayType))
    for (const { stayType, wifiMbps, workspace, ...seed } of extraHotels.filter(
      (h) => h.destinationId === destination.id,
    )) {
      const id = idOf(seed.destinationId, seed.name)
      if (all.some((h) => h.id === id)) throw new Error(`extraHotels: ${id} уже есть в каталоге`)
      const work = { ...(wifiMbps !== undefined && { wifiMbps }), ...(workspace !== undefined && { workspace }) }
      all.push(
        summaryOf({ ...seed, stars: seed.stars as HotelSeed['stars'] }, reviewCountOf(id), false, stayType, work),
      )
    }
  }
  return { all, newOnes: newHotelSeeds.map((seed) => fromSeed.get(seed)!) }
}

const summaries = buildSummaries()

/** All hotels, grouped by city in the order of `destinations`. */
export const hotels: HotelSummary[] = summaries.all
/** The hand-picked "recently added" hotels, in their original order. */
export const newHotels: HotelSummary[] = summaries.newOnes

/** Every second hotel of a city (by id; stays of other kinds do not count) sells only non-refundable rates. */
const nonRefundableIds = new Set(
  destinations.flatMap((d) =>
    hotels
      .filter((h) => h.destinationId === d.id && h.stayType === 'hotel')
      .map((h) => h.id)
      .sort()
      .filter((_, index) => index % 2 === 1),
  ),
)

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
/** The description's sentences of the stays other than hotels. */
const STAY_TEXTS = {
  hostel: {
    noun: 'хостел',
    rooms: [
      'В общих номерах капсульные кровати со шторками, розеткой и лампой, у каждого гостя свой шкафчик.',
      'Есть общие номера на 4–8 мест и несколько приватных комнат.',
      'Рядом — кафе, магазины и остановки общественного транспорта.',
    ],
    service: [
      'На общей кухне можно готовить, а по вечерам собираются попутчики со всего мира.',
      'Стойка регистрации работает круглосуточно, сотрудники подскажут маршруты.',
      'Хостел подходит студентам и тем, кто путешествует с рюкзаком и небольшим бюджетом.',
    ],
  },
  apartments: {
    noun: 'апартаменты',
    rooms: [
      'В апартаментах есть кухня с посудой, стиральная машина и удобная зона для работы.',
      'Просторные комнаты с большими окнами, всё необходимое для долгого проживания.',
      'Рядом — кафе, магазины и остановки общественного транспорта.',
    ],
    service: [
      'Заселение по коду, поддержка на связи в любое время.',
      'Уборка по запросу, бельё и полотенца уже в апартаментах.',
      'Апартаменты подходят для workation и для поездок на неделю и дольше.',
    ],
  },
  villa: {
    noun: 'вилла',
    rooms: [
      'В вилле несколько спален, просторная гостиная и кухня на всю компанию.',
      'Во дворе терраса с мангалом, зона отдыха и место для парковки.',
      'Рядом — магазины, кафе и тихие прогулочные маршруты.',
    ],
    service: [
      'Хозяева встретят и покажут дом, а по просьбе организуют трансфер.',
      'Вилла подходит большой компании или семье из нескольких поколений.',
      'Здесь удобно собраться на праздник и работать на свежем воздухе.',
    ],
  },
} as const

/** The first amenities of the catalogue: their draw comes first, so their choice stays as it was. */
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
/** What the optional amenities and the extra ones of a hostel, apartments or a villa are drawn from. */
const STAY_OPTIONAL: Record<Exclude<StayType, 'hotel'>, Amenity[]> = {
  hostel: ['air-conditioning', 'bar', 'family', 'pets'],
  apartments: ['air-conditioning', 'parking', 'family', 'pets', 'gym'],
  villa: ['air-conditioning', 'pool', 'parking', 'pets', 'family', 'sauna', 'bar'],
}
const STAY_EXTRAS: Amenity[] = [
  'computer',
  'heating',
  'security',
  'fire-extinguisher',
  'early-check-in',
  'late-check-out',
  'private-check-in',
  'non-smoking-rooms',
  'allergy-free-rooms',
  'fridge',
  'tv',
  'safe',
  'phone',
  'iron',
  'ironing-kit',
  'laundry',
  'luggage-storage',
  'tea-coffee',
  'first-aid',
  'celebrations',
  'staff-ru',
  'staff-en',
]
/** Every hotel has these. */
const BASE_AMENITIES: Amenity[] = ['wifi', 'front-desk']
/** The rest of the catalogue, drawn with a seed of their own. */
const EXTRA_AMENITIES = (Object.keys(AMENITIES) as Amenity[]).filter(
  (key) => !BASE_AMENITIES.includes(key) && !OPTIONAL_AMENITIES.includes(key),
)
const amenityOrder = new Map((Object.keys(AMENITIES) as Amenity[]).map((key, index) => [key, index]))

/**
 * The extra amenities: more of them in a hotel with more stars. They have their own seed, so the
 * rest of the hotel stays as it was.
 */
function extraAmenities(summary: HotelSummary): Amenity[] {
  const rng = seeded(`amenities:${summary.id}`)
  if (summary.stayType !== 'hotel') return rng.sample(STAY_EXTRAS, rng.int(8, 14))
  return rng.sample(EXTRA_AMENITIES, rng.int(6, 10) + summary.stars * 4)
}

/** The section scores scatter around the rating by up to 1.5, within 1…10; their own seed. */
function sectionScores(summary: HotelSummary): SectionScore[] {
  const rng = seeded(`scores:${summary.id}`)
  return SCORE_SECTIONS.map((label) => ({
    label,
    score: Math.max(1, Math.min(10, round1(summary.rating + (rng.next() * 2 - 1) * 1.5))),
  }))
}

/** The captions of the first five photos of each kind of stay. */
const STAY_PHOTOS: Record<StayType, string[]> = {
  hotel: ['Фасад', 'Лобби', 'Ресторан', 'Терраса', 'Вид из окна'],
  hostel: ['Фасад', 'Общая зона', 'Кухня', 'Спальня', 'Вид из окна'],
  apartments: ['Фасад', 'Гостиная', 'Кухня', 'Спальня', 'Вид из окна'],
  villa: ['Фасад', 'Гостиная', 'Бассейн', 'Терраса', 'Вид из окна'],
}
const PHOTOS_BEFORE_MORE = STAY_PHOTOS.hotel.length
/** Captions of the photos after the first five, and of the guests' photos. */
const MORE_PHOTOS = ['Номер', 'Ванная', 'Вид', 'Завтрак', 'Бассейн', 'Холл', 'Терраса', 'Ресторан', 'Улица', 'Бар']

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

type RoomType = {
  id: string
  name: string
  area: readonly [number, number]
  beds: string
  capacity: number
  factor: number
}

/** The rooms of each kind of stay: the first is the cheapest and always offered; a villa sleeps 6–10. */
const STAY_ROOM_TYPES: Record<StayType, readonly RoomType[]> = {
  hotel: ROOM_TYPES,
  hostel: [
    {
      id: 'dorm-8',
      name: 'Место в общем номере на 8 человек',
      area: [18, 24],
      beds: '1 место на двухъярусной кровати',
      capacity: 1,
      factor: 1,
    },
    {
      id: 'dorm-4',
      name: 'Место в общем номере на 4 человека',
      area: [12, 16],
      beds: '1 место на двухъярусной кровати',
      capacity: 1,
      factor: 1.25,
    },
    {
      id: 'private',
      name: 'Двухместный номер с общей ванной',
      area: [10, 14],
      beds: '1 двуспальная кровать',
      capacity: 2,
      factor: 2.4,
    },
    { id: 'family', name: 'Семейный номер', area: [16, 22], beds: '2 двухъярусные кровати', capacity: 4, factor: 3.6 },
  ],
  apartments: [
    { id: 'studio', name: 'Студия', area: [24, 34], beds: '1 двуспальная кровать', capacity: 2, factor: 1 },
    {
      id: 'one-bedroom',
      name: 'Апартаменты с 1 спальней',
      area: [38, 52],
      beds: '1 двуспальная кровать и диван',
      capacity: 3,
      factor: 1.4,
    },
    {
      id: 'two-bedroom',
      name: 'Апартаменты с 2 спальнями',
      area: [60, 80],
      beds: '2 двуспальные кровати и диван',
      capacity: 5,
      factor: 2,
    },
  ],
  villa: [
    {
      id: 'villa-3',
      name: 'Вилла с 3 спальнями',
      area: [120, 150],
      beds: '3 двуспальные кровати',
      capacity: 6,
      factor: 1,
    },
    {
      id: 'villa-4',
      name: 'Вилла с 4 спальнями',
      area: [160, 200],
      beds: '4 двуспальные кровати',
      capacity: 8,
      factor: 1.25,
    },
    {
      id: 'villa-5',
      name: 'Вилла с 5 спальнями и бассейном',
      area: [210, 280],
      beds: '5 двуспальных кроватей',
      capacity: 10,
      factor: 1.6,
    },
  ],
}

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
    'Хорошее место за свои деньги.',
    'Номер небольшой, но уютный.',
    'Wi‑Fi иногда пропадал, в остальном всё хорошо.',
    'Вечером шумновато, зато центр рядом.',
  ],
  low: ['Номер не соответствовал фотографиям.', 'Долго ждали заселения.', 'Кондиционер работал плохо.'],
}
/** More of the good, drawn with a seed of their own: some reviews run longer than six lines. */
const REVIEW_MORE = [
  'Номер просторный, с большим окном, по утрам в нём много света, а вечером тихо даже с открытым окном.',
  'На ресепшене всегда приветливо здоровались, подсказали, куда сходить поужинать и как добраться до вокзала.',
  'Кровать широкая и удобная, подушки на выбор, постельное бельё меняли каждый день без напоминаний.',
  'Завтрак подают с семи утра: горячие блюда, выпечка, фрукты, есть безглютеновые продукты по запросу.',
  'Уборка ежедневная и аккуратная, в ванной хорошая косметика и всегда свежие полотенца.',
  'До ближайшей остановки две минуты пешком, рядом круглосуточный магазин и несколько хороших кафе.',
]
const REVIEW_CONS = [
  'Слабая звукоизоляция, слышно соседей и лифт.',
  'Завтрак однообразный, к концу недели надоел.',
  'Ранний заезд только за доплату.',
  'В номере не хватало розеток у кровати.',
  'Душ то горячий, то холодный, долго подстраивали воду.',
  'Парковка платная и маленькая, мест часто нет.',
  'Шумно по ночам из-за бара на первом этаже.',
]
/** Reviews are dated back from a fixed day: the catalogue must not depend on the build date. */
const REVIEWS_UNTIL: IsoDate = '2026-09-30'

const KM_PER_DEGREE = 111.32

/**
 * Demo transport: a station of the city's metro picked by the hotel id, 150–1 200 m away to the
 * nearest 10 m. It has its own seed so the rest of the hotel stays as it was.
 */
function nearestStation(hotelId: string, stations: string[] | undefined): NearestStation | null {
  if (!stations?.length) return null
  const rng = seeded(`metro:${hotelId}`)
  return { station: rng.pick(stations), meters: Math.round(rng.int(150, 1200) / 10) * 10 }
}

/** The photos after the first five, 7–25 of them: a seed of their own, so the rest of the hotel stays as it was. */
function morePhotos(hotelId: string): Photo[] {
  const rng = seeded(`photos:${hotelId}`)
  return Array.from({ length: rng.int(12, 30) - PHOTOS_BEFORE_MORE }, (_, i) => ({
    id: `photo-${PHOTOS_BEFORE_MORE + i + 1}`,
    caption: rng.pick(MORE_PHOTOS),
    tone: rng.int(0, PHOTO_TONE_COUNT - 1),
  }))
}

/** 0–40 photos of the guests, their own seed. */
function guestPhotos(hotelId: string): Photo[] {
  const rng = seeded(`guest-photos:${hotelId}`)
  return Array.from({ length: rng.int(0, 40) }, (_, i) => ({
    id: `guest-photo-${i + 1}`,
    caption: rng.pick(MORE_PHOTOS),
    tone: rng.int(0, PHOTO_TONE_COUNT - 1),
  }))
}

/**
 * The longer good, the bad of about half the reviews and their usefulness, with a seed of the review
 * of their own: the scores and dates stay as they were.
 */
function reviewDetails(review: Review): Review {
  const rng = seeded(`review:${review.id}`)
  const more = rng.next() < 0.35 ? rng.sample(REVIEW_MORE, rng.int(2, 4)) : []
  const cons = rng.next() < 0.5 ? rng.sample(REVIEW_CONS, rng.int(1, 2)).join(' ') : undefined
  return {
    ...review,
    pros: [review.pros, ...more].join(' '),
    ...(cons && { cons }),
    helpful: rng.int(0, 60),
  }
}

/** What a real hotel brings of its own: the rest of it is generated, the photos too when it has none. */
export type RealHotelDetails = Pick<Hotel, 'address' | 'lat' | 'lon' | 'distanceKm' | 'metro' | 'amenities' | 'rooms'> &
  Partial<Pick<Hotel, 'photos'>>

function buildHotel(summary: HotelSummary, real?: RealHotelDetails): Hotel {
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
    ...BASE_AMENITIES,
    ...(summary.stayType === 'hotel'
      ? rng.sample(OPTIONAL_AMENITIES, rng.int(2, 3) + Math.max(0, summary.stars - 2))
      : rng.sample(STAY_OPTIONAL[summary.stayType], rng.int(2, 3))),
    ...extraAmenities(summary),
  ].sort((a, b) => amenityOrder.get(a)! - amenityOrder.get(b)!)

  const available = STAY_ROOM_TYPES[summary.stayType]
  const roomTypes = [available[0], ...rng.sample(available.slice(1), rng.int(2, available.length - 1))]
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
        ...(nonRefundableIds.has(summary.id) && { cancellation: { kind: 'non-refundable' } as const }),
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
      pros: rng.sample(texts, rng.int(1, 2)).join(' '),
      helpful: 0,
    }
  })
    .map(reviewDetails)
    // Every generated review has its date.
    .sort((a, b) => b.date!.localeCompare(a.date!) || a.id.localeCompare(b.id))

  const distance = `${(real?.distanceKm ?? distanceKm).toLocaleString('ru-RU')} км`
  const texts =
    summary.stayType === 'hotel'
      ? { rooms: DESCRIPTION_ROOMS, service: DESCRIPTION_SERVICE }
      : STAY_TEXTS[summary.stayType]
  const kind =
    summary.stayType !== 'hotel'
      ? STAY_TEXTS[summary.stayType].noun
      : summary.stars > 0
        ? `${summary.stars}-звёздочный отель`
        : 'отель'
  return {
    ...summary,
    address: `${destination.name}, ${district}, д. ${rng.int(1, 120)}`,
    lat: Math.round(lat * 1e4) / 1e4,
    lon: Math.round(lon * 1e4) / 1e4,
    distanceKm,
    metro: nearestStation(summary.id, destination.metro),
    amenities,
    sectionScores: sectionScores(summary),
    description: [
      real
        ? `${summary.name} — ${kind} в ${distance} от центра ${destination.genitive}.`
        : `${summary.name} — ${kind} в районе «${district}», в ${distance} от центра.`,
      rng.pick(texts.rooms),
      rng.pick(texts.service),
    ].join(' '),
    checkInTime: '14:00',
    checkOutTime: '12:00',
    photos: [
      ...STAY_PHOTOS[summary.stayType].map((caption, i) => photo(`photo-${i + 1}`, caption)),
      ...morePhotos(summary.id),
    ],
    guestPhotos: guestPhotos(summary.id),
    rooms,
    reviews,
    ...real,
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
export const buildCatalog = (): Hotel[] => buildSummaries().all.map((summary) => buildHotel(summary))

/**
 * A real hotel (src/lib/ota/hotel.ts): its own summary and details, and the rest generated as for the demo
 * hotels, seeded by its id: the description, the section scores, the reviews and the guests' photos.
 */
export const generateHotel = (summary: HotelSummary, real: RealHotelDetails): Hotel => buildHotel(summary, real)
