import { z } from 'zod'
import { SCORE_SECTIONS, type Review, type SectionScore } from '../catalog'
import { isDoubtfulBuilding } from '../features'
import { formatDecimal } from '../format'
import type {
  AmenityGroup,
  DescriptionPart,
  HotelBuilding,
  HotelDetails,
  HotelFacts,
  NearbyPlace,
  PolicyLine,
  SourceScores,
  ViewQuote,
} from '../hotelDetails'
import { REVIEW_SOURCE_OF_CODE, type ReviewSource } from '../hotelDetails'
import type { OtaPageFields } from './hotel'

/**
 * The licensed snapshots of the Ostrovok hotel pages (`<master_id>.json`, a list of the page's elements): the
 * element `__NEXT_DATA__` holds `props.pageProps`. The loader (`npm run db:load:ota-pages`) keeps of it only the
 * hotel, its reviews, the places of interest and the rate tags (`trimPage`), never the contacts; the site reads the
 * stored parts back as `HotelDetails` (`otaHotelDetails`). The files are untrusted: every part is checked here,
 * an unknown value is skipped, nothing is filled in.
 */

const text = z.string().catch('')
const count = z.number().int().nonnegative().catch(0)
const optionalCount = z.number().int().positive().nullable().catch(null)

const poiSchema = z.object({
  regionId: z.number().int().positive(),
  type: z.string().min(1),
  subtype: z.string().catch('UNSPECIFIED'),
  name: text,
  nameEn: text,
  catalogSlug: z.string().nullable().catch(null),
  inflection: z
    .object({ genitive: z.string().nullable().catch(null), locativeIn: z.string().nullable().catch(null) })
    .nullable()
    .catch(null),
  center: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
})

const hotelPoiSchema = z.object({
  regionId: z.number().int().positive(),
  distance: z.number().nonnegative(),
  name: text,
  nameEn: text,
  isNearby: z.boolean().catch(false),
  isTopPoi: z.boolean().catch(false),
  isTransportHub: z.boolean().catch(false),
})

const rateTagSchema = z.object({
  name: z.string().min(1),
  translation: z.string(),
  priority: z.number().int(),
  adjKind: z.string(),
})

/** What the loader checks of `props.pageProps`; the hotel and the reviews are kept as they are, less the trimmed. */
const pagePropsSchema = z.object({
  hotel: z.looseObject({
    masterId: z.coerce.number().int().positive(),
    location: z.looseObject({ pois: z.array(hotelPoiSchema).catch([]) }),
  }),
  pois: z.array(poiSchema).catch([]),
  reviews: z.looseObject({ list: z.array(z.unknown()).catch([]) }).catch({ list: [] }),
  rateSpecTagTranslations: z.array(rateTagSchema).catch([]),
})

export type OtaPoi = z.infer<typeof poiSchema>
export type OtaRateTag = z.infer<typeof rateTagSchema>

/** `props.pageProps` of a snapshot: the element `__NEXT_DATA__`, its `content` an object or its JSON. */
export function nextDataPageProps(snapshot: unknown): unknown {
  if (!Array.isArray(snapshot)) throw new Error('ota page: the snapshot is not a list of elements')
  const element = snapshot.find(
    (item): item is { content: unknown } =>
      typeof item === 'object' && item !== null && (item as { id?: unknown }).id === '__NEXT_DATA__',
  )
  if (!element) throw new Error('ota page: no __NEXT_DATA__ element')
  const content = typeof element.content === 'string' ? JSON.parse(element.content) : element.content
  const props = (content as { props?: { pageProps?: unknown } } | null)?.props?.pageProps
  if (!props) throw new Error('ota page: no props.pageProps in __NEXT_DATA__')
  return props
}

/** The images' `relativePath` is the path of their `tmpl` again. */
const withoutRelativePath = (images: unknown) =>
  Array.isArray(images)
    ? images.map((image) => {
        if (typeof image !== 'object' || image === null) return image
        const { relativePath: _path, ...rest } = image as Record<string, unknown>
        return rest
      })
    : images

export interface TrimmedPage {
  masterId: number
  /** `hotel` without `contacts`, `location.pois` and the images' `relativePath`. */
  hotel: Record<string, unknown>
  reviews: Record<string, unknown>
  pois: OtaPoi[]
  /** The hotel's places: Ostrovok's distance to each and its marks. */
  hotelPois: z.infer<typeof hotelPoiSchema>[]
  rateTags: OtaRateTag[]
}

/**
 * The parts of a page the database keeps: the hotel without its contacts and its places (they go to their own
 * tables, once each), the reviews, the places of interest the hotel's places point to, and the rate tags.
 */
export function trimPage(pageProps: unknown): TrimmedPage {
  const page = pagePropsSchema.parse(pageProps)
  const {
    contacts: _contacts,
    location,
    images,
    roomGroups,
    ...hotel
  } = page.hotel as Record<string, unknown> & {
    location: Record<string, unknown>
  }
  const { pois: hotelPois, ...place } = location
  const rooms = Array.isArray(roomGroups)
    ? roomGroups.map((group) =>
        typeof group === 'object' && group !== null
          ? { ...group, images: withoutRelativePath((group as { images?: unknown }).images) }
          : group,
      )
    : roomGroups
  const known = new Set(page.pois.map((poi) => poi.regionId))
  return {
    masterId: page.hotel.masterId,
    hotel: { ...hotel, location: place, images: withoutRelativePath(images), roomGroups: rooms },
    reviews: page.reviews,
    pois: [...new Map(page.pois.map((poi) => [poi.regionId, poi])).values()],
    // A place without its point in the page's places is skipped: the page has no point for it.
    hotelPois: [
      ...new Map(
        (hotelPois as z.infer<typeof hotelPoiSchema>[])
          .filter((p) => known.has(p.regionId))
          .map((p) => [p.regionId, p]),
      ).values(),
    ],
    rateTags: page.rateSpecTagTranslations,
  }
}

// —— Reading the stored page ——

/** The columns of `ota_hotel_pages` the site reads: the small parts of the hotel, not its room groups or images. */
export const PAGE_COLUMNS =
  'master_id, description:hotel->descriptionStruct, amenityGroups:hotel->amenityGroups, policies:hotel->policies, facts:hotel->facts, rating:hotel->rating, reviews'

/** The columns of `ota_hotel_places`. */
export const PLACE_COLUMNS =
  'hotel_id, region_id, type, subtype, name, name_en, distance_m, is_transport_hub, lat, lon, bearing_deg'

const time = z
  .object({ hours: z.number().int().min(0).max(23), minutes: z.number().int().min(0).max(59) })
  .nullable()
  .catch(null)

const descriptionSchema = z
  .array(z.object({ title: text, paragraphs: z.array(z.string()).catch([]) }).catch({ title: '', paragraphs: [] }))
  .catch([])

export const amenityGroupsSchema = z
  .array(
    z
      .object({ name: text, slug: text, amenities: z.array(z.object({ name: text }).catch({ name: '' })).catch([]) })
      .catch({ name: '', slug: '', amenities: [] }),
  )
  .catch([])

const policyItem = z.looseObject({
  inclusion: z.string().optional().catch(undefined),
  currency: z.string().optional().catch(undefined),
  price: z.number().optional().catch(undefined),
  priceUnit: z.string().optional().catch(undefined),
})
const policy = z
  .object({ value: z.array(policyItem).catch([]) })
  .nullable()
  .catch(null)

const policiesSchema = z
  .object({
    checkInCheckOut: z
      .object({
        value: z.object({ checkInTimeStart: time, checkOutTimeEnd: time }).catch({
          checkInTimeStart: null,
          checkOutTimeEnd: null,
        }),
      })
      .nullable()
      .catch(null),
    extraInfo: z
      .object({ value: z.string().nullable().catch(null) })
      .nullable()
      .catch(null),
    parking: policy,
    pets: policy,
    deposit: policy,
    extraBed: policy,
    meal: policy,
    childrenMeal: policy,
    cradle: policy,
    eclc: policy,
    shuttle: policy,
    addFee: policy,
    children: policy,
    internet: policy,
  })
  .catch({
    checkInCheckOut: null,
    extraInfo: null,
    parking: null,
    pets: null,
    deposit: null,
    extraBed: null,
    meal: null,
    childrenMeal: null,
    cradle: null,
    eclc: null,
    shuttle: null,
    addFee: null,
    children: null,
    internet: null,
  })

const factsSchema = z
  .object({
    floorsNumber: optionalCount,
    roomsNumber: optionalCount,
    yearBuilt: optionalCount,
    yearRenovated: optionalCount,
    electricity: z
      .object({
        frequency: z.array(z.number()).catch([]),
        sockets: z.array(z.string()).catch([]),
        voltage: z.array(z.number()).catch([]),
      })
      .nullable()
      .catch(null),
  })
  .catch({ floorsNumber: null, roomsNumber: null, yearBuilt: null, yearRenovated: null, electricity: null })

const detailed = z.record(z.string(), z.number()).nullable().catch(null)

const ratingSchema = z
  .object({
    ostrovok: z
      .object({ detailedRatings: detailed, numReviews: count, rating: z.number().nullable().catch(null) })
      .nullable()
      .catch(null),
    tripAdvisor: z
      .object({ detailedRatings: detailed, numReviews: count, rating: z.number().nullable().catch(null) })
      .nullable()
      .catch(null),
    featuredReviews: z
      .array(
        z
          .object({
            text,
            reviewPlus: text,
            reviewMinus: text,
            author: text,
            rating: z.number().min(0).max(10).catch(0),
            source: text,
          })
          .nullable()
          .catch(null),
      )
      .catch([]),
  })
  .catch({ ostrovok: null, tripAdvisor: null, featuredReviews: [] })

const listReviewSchema = z
  .object({
    id: z.number().int(),
    reviewType: text,
    reviewDate: text,
    reviewTitle: text,
    reviewText: text,
    reviewPlus: text,
    reviewMinus: text,
    orderContext: z.object({ authorName: text }).catch({ authorName: '' }),
    rating: z.number().min(0).max(10).catch(0),
    reviewLikes: count,
  })
  .nullable()
  .catch(null)

const reviewsSchema = z.object({ list: z.array(listReviewSchema).catch([]) }).catch({ list: [] })

/** A row of `ota_hotel_pages` read with `PAGE_COLUMNS`. */
export const pageRowSchema = z.object({
  master_id: z.coerce.number().int().positive(),
  description: descriptionSchema,
  amenityGroups: amenityGroupsSchema,
  policies: policiesSchema,
  facts: factsSchema,
  rating: ratingSchema,
  reviews: reviewsSchema,
})

export type PageRow = z.infer<typeof pageRowSchema>

/** A row of `ota_hotel_places` read with `PLACE_COLUMNS`. */
export const placeRowSchema = z.object({
  hotel_id: z.string(),
  region_id: z.coerce.number().int(),
  type: z.string(),
  subtype: z.string(),
  name: z.string(),
  name_en: z.string(),
  distance_m: z.number().int().nonnegative(),
  is_transport_hub: z.boolean(),
  lat: z.number(),
  lon: z.number(),
  bearing_deg: z.number().nullable(),
})

export type PlaceRow = z.infer<typeof placeRowSchema>

/** The building of `hotel_features` read with `floors, height_m, floors_source, height_source`. */
export interface BuildingRow {
  floors: number | null
  height_m: number | null
  floors_source: string | null
  height_source: string | null
}

// —— The parts ——

const clean = (value: string) => value.replace(/\s+/g, ' ').trim()

/** The description by its parts, the empty paragraphs and parts dropped. */
export const descriptionOf = (row: Pick<PageRow, 'description'>): DescriptionPart[] =>
  row.description
    .map(({ title, paragraphs }) => ({
      title: clean(plainNotes(title)),
      // Ostrovok marks a few words with `<em>`: the text only.
      paragraphs: paragraphs.map((paragraph) => clean(plainNotes(paragraph))).filter(Boolean),
    }))
    .filter((part) => part.paragraphs.length > 0)

/** The description as one text: the catalogue row's `description`, the parts in their order. */
export const descriptionText = (row: Pick<PageRow, 'description'>): string =>
  descriptionOf(row)
    .flatMap((part) => part.paragraphs)
    .join('\n\n')

const pad = (value: number) => String(value).padStart(2, '0')
const timeOf = (value: z.infer<typeof time>) => value && `${pad(value.hours)}:${pad(value.minutes)}`

/** «15:00» and «11:00» of the hotel's policies; `null` where the page has none. */
export function stayTimes(row: Pick<PageRow, 'policies'>): { checkIn: string | null; checkOut: string | null } {
  const times = row.policies.checkInCheckOut?.value
  return { checkIn: timeOf(times?.checkInTimeStart ?? null), checkOut: timeOf(times?.checkOutTimeEnd ?? null) }
}

const SOCKETS = (list: number[]) => [...new Set(list)].join('/')

function factsOf(row: Pick<PageRow, 'facts'>): HotelFacts {
  const { floorsNumber, roomsNumber, yearBuilt, yearRenovated, electricity } = row.facts
  const power = electricity && [
    electricity.sockets.length > 0 && `Розетки ${[...new Set(electricity.sockets)].join(', ')}`,
    electricity.voltage.length > 0 && `${SOCKETS(electricity.voltage)} В`,
    electricity.frequency.length > 0 && `${SOCKETS(electricity.frequency)} Гц`,
  ]
  const electricityLine = power?.filter(Boolean).join(' · ') || null
  return {
    rooms: roomsNumber,
    roomFloors: floorsNumber,
    yearBuilt,
    yearRenovated,
    electricity: electricityLine,
  }
}

const UNIT: Record<string, string> = {
  PER_ROOM_PER_NIGHT: 'за номер в сутки',
  PER_ROOM_PER_STAY: 'за номер за проживание',
  PER_GUEST_PER_NIGHT: 'за гостя в сутки',
  PER_GUEST_PER_STAY: 'за гостя за проживание',
  PER_CAR_PER_NIGHT: 'за машину в сутки',
  PER_PET_PER_NIGHT: 'за питомца в сутки',
  PER_PET_PER_STAY: 'за питомца за проживание',
  PER_WEEK: 'в неделю',
}
const CURRENCY: Record<string, string> = { EUR: '€', RUB: '₽', USD: '$' }

/** «22 € за машину в сутки», «включено»; `null` without a price. */
function priceOf(item: z.infer<typeof policyItem>): string | null {
  if (item.inclusion === 'INCLUDED') return 'включено в стоимость'
  if (!item.price || !item.currency) return null
  const amount = Number.isInteger(item.price) ? String(item.price) : formatDecimal(Math.round(item.price * 10) / 10)
  return [`${amount} ${CURRENCY[item.currency] ?? item.currency}`, item.priceUnit && UNIT[item.priceUnit]]
    .filter(Boolean)
    .join(' ')
}

const PARKING_PLACE: Record<string, string> = { ON_SIDE: 'на территории', OFF_SIDE: 'рядом с отелем' }
const DEPOSIT_KIND: Record<string, string> = { KEYS: 'за ключи', PET: 'за питомца' }
const DEPOSIT_PAYMENT: Record<string, string> = { CARD: 'картой', CASH: 'наличными' }
const SHUTTLE: Record<string, string> = { ONE_WAY: 'в одну сторону', TWO_WAYS: 'в обе стороны' }
const FEE: Record<string, string> = { HOUSEKEEPING: 'Уборка', TOWELS: 'Полотенца' }
const MEAL: Record<string, string> = { BREAKFAST: 'Завтрак', LUNCH: 'Обед', DINNER: 'Ужин' }

const str = (value: unknown) => (typeof value === 'string' ? value : '')
const ages = (item: Record<string, unknown>) => {
  const start = Number(item.ageStart) || 0
  const end = Number(item.ageEnd) || 0
  return end > 0 ? ` (${start}–${end} лет)` : ''
}

/** The label of a policy's item; `null` for one the page says nothing usable of. */
const POLICY_LABEL: Record<string, (item: Record<string, unknown>) => string | null> = {
  parking: (item) => ['Парковка', PARKING_PLACE[str(item.territoryType)]].filter(Boolean).join(' '),
  pets: () => 'Размещение с питомцами',
  deposit: (item) =>
    ['Депозит', DEPOSIT_KIND[str(item.depositType)], DEPOSIT_PAYMENT[str(item.paymentType)]].filter(Boolean).join(' '),
  extraBed: () => 'Дополнительная кровать',
  meal: (item) => MEAL[str(item.mealType)] ?? 'Питание',
  childrenMeal: (item) => `${MEAL[str(item.mealType)] ?? 'Питание'} для детей${ages(item)}`,
  cradle: () => 'Детская кроватка',
  eclc: () => 'Ранний заезд или поздний выезд',
  shuttle: (item) =>
    str(item.destinationType) === 'AIRPORT'
      ? ['Трансфер в аэропорт или из аэропорта', SHUTTLE[str(item.shuttleType)]].filter(Boolean).join(', ')
      : 'Трансфер',
  addFee: (item) => FEE[str(item.feeType)] ?? 'Дополнительный сбор',
  internet: () => 'Интернет',
  children: () => null,
}

/** The paid services and the fees: a line a priced item, and the children's extra bed when it is not available. */
function policiesOf(row: Pick<PageRow, 'policies'>): PolicyLine[] {
  const lines: PolicyLine[] = []
  for (const [key, label] of Object.entries(POLICY_LABEL)) {
    const items = (row.policies[key as keyof typeof row.policies] as z.infer<typeof policy>)?.value ?? []
    for (const item of items) {
      if (key === 'children') {
        if (item.extraBed === 'UNAVAILABLE')
          lines.push({ label: 'Дополнительная кровать для детей', value: 'не предоставляется' })
        continue
      }
      const value = priceOf(item)
      const name = label(item)
      if (value && name) lines.push({ label: name, value })
    }
  }
  return [...new Map(lines.map((line) => [`${line.label}\n${line.value}`, line])).values()]
}

/** Ostrovok's keys of the detailed ratings, in the order of `SCORE_SECTIONS`. */
const SECTION_KEYS: Record<(typeof SCORE_SECTIONS)[number], string> = {
  Чистота: 'cleanness',
  Расположение: 'location',
  'Цена/Качество': 'price',
  Обслуживание: 'services',
  'Средства гигиены': 'hygiene',
  Питание: 'meal',
  Номер: 'room',
  'Качество Wi‑Fi': 'wifi',
}

const sectionsOf = (ratings: Record<string, number> | null): SectionScore[] =>
  ratings
    ? SCORE_SECTIONS.flatMap((label) => {
        const score = ratings[SECTION_KEYS[label]]
        return score && score > 0 && score <= 10 ? [{ label, score: Math.round(score * 10) / 10 }] : []
      })
    : []

function scoresOf(row: Pick<PageRow, 'rating'>): SourceScores[] {
  const { ostrovok, tripAdvisor } = row.rating
  const scores: SourceScores[] = []
  if (ostrovok && (ostrovok.numReviews > 0 || sectionsOf(ostrovok.detailedRatings).length > 0))
    scores.push({
      source: 'ostrovok',
      rating: ostrovok.rating && ostrovok.rating > 0 ? Math.round(ostrovok.rating * 10) / 10 : null,
      scale: 10,
      reviewCount: ostrovok.numReviews,
      sections: sectionsOf(ostrovok.detailedRatings),
    })
  if (tripAdvisor && (tripAdvisor.numReviews > 0 || sectionsOf(tripAdvisor.detailedRatings).length > 0))
    scores.push({
      source: 'tripadvisor',
      rating: tripAdvisor.rating && tripAdvisor.rating > 0 ? tripAdvisor.rating : null,
      scale: 5,
      reviewCount: tripAdvisor.numReviews,
      sections: sectionsOf(tripAdvisor.detailedRatings),
    })
  return scores
}

/** The review's source by its code (`REVIEW_SOURCE_OF_CODE`); `null` for a code not known. */
const sourceOf = (code: string): ReviewSource | null => REVIEW_SOURCE_OF_CODE[code] ?? null

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/
const key = (value: string | undefined) => clean(value ?? '').toLocaleLowerCase('ru')

/**
 * Every review of the page: the list, then the featured ones it does not have (the same author's same text), newest
 * first and the undated after them. A review without a score or without any text is skipped.
 */
export function reviewsOf(row: Pick<PageRow, 'master_id' | 'rating' | 'reviews'>): Review[] {
  const listed: Review[] = row.reviews.list.flatMap((review) => {
    const source = review && sourceOf(review.reviewType)
    if (!review || !source || review.rating <= 0) return []
    const parts = {
      title: clean(review.reviewTitle),
      text: clean(review.reviewText),
      pros: clean(review.reviewPlus),
      cons: clean(review.reviewMinus),
    }
    if (!parts.text && !parts.pros && !parts.cons) return []
    return [
      {
        id: `ota-review-${review.id}`,
        author: clean(review.orderContext.authorName) || 'Гость',
        date: ISO_DAY.test(review.reviewDate) ? review.reviewDate.slice(0, 10) : null,
        score: review.rating,
        ...Object.fromEntries(Object.entries(parts).filter(([, value]) => value)),
        source,
        helpful: review.reviewLikes,
      },
    ]
  })
  const known = new Set(listed.flatMap((r) => [key(r.text), key(r.pros)].filter(Boolean)))
  const featured: Review[] = row.rating.featuredReviews.flatMap((review, index) => {
    const source = review && sourceOf(review.source)
    if (!review || !source || review.rating <= 0) return []
    const parts = { text: clean(review.text), pros: clean(review.reviewPlus), cons: clean(review.reviewMinus) }
    if (!parts.text && !parts.pros && !parts.cons) return []
    if ((parts.text && known.has(key(parts.text))) || (!parts.text && parts.pros && known.has(key(parts.pros))))
      return []
    return [
      {
        id: `ota-featured-${row.master_id}-${index + 1}`,
        author: clean(review.author) || 'Гость',
        date: null,
        score: review.rating,
        ...Object.fromEntries(Object.entries(parts).filter(([, value]) => value)),
        source,
        helpful: 0,
      },
    ]
  })
  return [...listed, ...featured].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id))
}

/**
 * A word about the view: «вид на», «с видом», «вид из окна», «панорама»; not «внешний вид», «вид на жительство»
 * or «в виде».
 */
const VIEW =
  /(?:^|[^а-яё])(?:(?<!внешн[а-яё]*\s)вид(?:ом|ами)?(?=[\s,.!:;)–—-]|$)(?!\s+на\s+жительств)|вида\s+(?:на|из)\s|панорам)/i
/** A quote is a sentence; a longer one is cut at a word with «…». */
const MAX_QUOTE = 280

const sentencesOf = (value: string) =>
  value
    .split(/(?<=[.!?…])\s+|\n+/)
    .map(clean)
    .filter(Boolean)

function quote(sentence: string): string {
  if (sentence.length <= MAX_QUOTE) return sentence
  const cut = sentence.slice(0, MAX_QUOTE)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

/** The sentences of the reviews about the view, word for word, once each. */
export function viewQuotes(reviews: readonly Review[]): ViewQuote[] {
  const quotes = new Map<string, ViewQuote>()
  for (const review of reviews)
    for (const part of [review.title, review.text, review.pros, review.cons])
      for (const sentence of sentencesOf(part ?? ''))
        if (VIEW.test(sentence) && !quotes.has(key(sentence)))
          quotes.set(key(sentence), {
            reviewId: review.id,
            source: review.source ?? 'ostrovok',
            author: review.author,
            text: quote(sentence),
          })
  return [...quotes.values()]
}

const PLACE_KIND: Record<string, string> = {
  HISTORICAL_POI: 'Достопримечательность',
  MUSEUM: 'Музей',
  PARK: 'Парк',
  SHOPPING: 'Шопинг',
  ZOOS_AND_AQUARIUMS: 'Зоопарк или аквариум',
  CHURCH: 'Храм',
  THEATER: 'Театр',
  CONCERTS_AND_PERFORMANCES: 'Концерты и шоу',
  HARBOR: 'Порт',
  ENTERTAINMENT_AND_GAMES: 'Развлечения',
  BEACH: 'Пляж',
  ARENAS_AND_STADIUMS: 'Стадион или арена',
  LIBRARY: 'Библиотека',
  HOSPITAL: 'Больница',
}
const TYPE_KIND: Record<string, string> = { SUBWAY: 'Станция', AIRPORT: 'Аэропорт' }

/** «Музей», «Станция», …; «Место» for a kind Ostrovok does not name. */
export const placeKind = (type: string, subtype: string) => TYPE_KIND[type] ?? PLACE_KIND[subtype] ?? 'Место'

export const nearbyOf = (places: readonly PlaceRow[]): NearbyPlace[] =>
  places
    .map((place) => ({
      id: place.region_id,
      name: place.name || place.name_en,
      kind: placeKind(place.type, place.subtype),
      distanceM: place.distance_m,
      bearingDeg: place.bearing_deg,
      lat: place.lat,
      lon: place.lon,
      transport: place.is_transport_hub,
    }))
    .sort((a, b) => a.distanceM - b.distanceM || a.id - b.id)

/** The building at the hotel's point; none when it is lower than the floors the rooms take (`isDoubtfulBuilding`). */
const buildingOf = (row: BuildingRow | null | undefined, roomFloors: number | null): HotelBuilding | null =>
  row && (row.floors || row.height_m) && !isDoubtfulBuilding(row.floors, roomFloors)
    ? {
        floors: row.floors,
        heightM: row.height_m,
        estimated: row.floors_source === 'estimated' || (!row.floors_source && row.height_source === 'estimated'),
      }
    : null

export const amenityGroupsOf = (row: Pick<PageRow, 'amenityGroups'>): AmenityGroup[] =>
  row.amenityGroups
    .map(({ name, slug, amenities }) => ({
      name: clean(name),
      slug,
      amenities: [...new Set(amenities.map((a) => clean(a.name)).filter(Boolean))],
    }))
    .filter((group) => group.name && group.amenities.length > 0)

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/**
 * Plain text of the hotel's notes, which Ostrovok gives partly as HTML: a line a paragraph, a break or an item
 * («• » before the item), the bold and the other tags dropped, the entities decoded. Never rendered as HTML.
 */
export function plainNotes(value: string): string {
  return value
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>|<\/(?:p|li|ul|ol|div)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|[a-z]+);/gi, (entity, name: string) =>
      name.startsWith('#') ? String.fromCodePoint(Number(name.slice(1))) : (ENTITIES[name.toLowerCase()] ?? entity),
    )
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line && line !== '•')
    .join('\n')
}

/** The hotel's details from its page, its places and the building at its point. */
export function otaHotelDetails(
  row: PageRow,
  places: readonly PlaceRow[],
  building?: BuildingRow | null,
): HotelDetails {
  const reviews = reviewsOf(row)
  const notes = plainNotes(row.policies.extraInfo?.value ?? '')
  return {
    description: descriptionOf(row),
    amenityGroups: amenityGroupsOf(row),
    policies: policiesOf(row),
    notes: notes || null,
    facts: factsOf(row),
    building: buildingOf(building, row.facts.floorsNumber),
    scores: scoresOf(row),
    reviews,
    nearby: nearbyOf(places),
    viewQuotes: viewQuotes(reviews),
  }
}

/** Whether a room group of the page has a workspace (`roomAmenityData` has `workstation`). */
export const hasWorkstation = (roomGroups: unknown): boolean =>
  Array.isArray(roomGroups) &&
  roomGroups.some(
    (group) =>
      Array.isArray((group as { roomAmenityData?: unknown })?.roomAmenityData) &&
      (group as { roomAmenityData: unknown[] }).roomAmenityData.includes('workstation'),
  )

/** The columns of `ota_hotel_pages` the catalogue row takes (`pageFields`). */
export const PAGE_FIELDS_COLUMNS =
  'master_id, description:hotel->descriptionStruct, policies:hotel->policies, roomGroups:hotel->roomGroups'

export const pageFieldsRowSchema = z.object({
  master_id: z.coerce.number().int().positive(),
  description: descriptionSchema,
  policies: policiesSchema,
  roomGroups: z.unknown(),
})

/** What the page gives the hotel's catalogue row: the description, the times and the workspace. */
export function pageFields(row: z.infer<typeof pageFieldsRowSchema>): OtaPageFields {
  const { checkIn, checkOut } = stayTimes(row)
  return { description: descriptionText(row), checkIn, checkOut, workspace: hasWorkstation(row.roomGroups) }
}

/** The columns of `ota_hotel_pages` for `roomFloorsOf`. */
export const ROOM_FLOORS_COLUMNS = 'master_id, floors:hotel->facts->floorsNumber'

/** The floors each hotel's rooms take, as the hotel says (Ostrovok's `floorsNumber`), by hotel id. */
export const roomFloorsOf = (rows: readonly { master_id: unknown; floors: unknown }[]): Map<string, number> =>
  new Map(
    rows.flatMap((row) => {
      const floors = Number(row.floors)
      return Number.isInteger(floors) && floors > 0 ? [[`ota-${Number(row.master_id)}`, floors] as const] : []
    }),
  )
