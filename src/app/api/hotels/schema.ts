import { z } from 'zod'
import {
  AMENITIES,
  PHOTO_TONE_COUNT,
  SCORE_SECTIONS,
  STAY_TYPES,
  type Amenity,
  type Hotel,
  type HotelSummary,
  type StayType,
} from '@/lib/catalog'
import { BBOX_PATTERN, MAX_BOX_SPAN_DEG, parseBox } from '@/lib/mapBox'
import { cacheHeader, component, errorSchema, sameType, type ApiOperation } from '@/lib/openapi/operation'
import idsExample from '@/lib/openapi/examples/hotels-ids.json'
import bboxExample from '@/lib/openapi/examples/hotels-bbox.json'
import destinationsExample from '@/lib/openapi/examples/hotels-destinations.json'

/** `GET /api/hotels`: the request's parameters, the hotel of the catalogue and the operation of the document. */

/** At most this many hotels or cities a request. */
export const MAX_IDS = 60

const idList = z
  .string()
  .transform((value) => value.split(',').filter(Boolean))
  .pipe(
    z
      .array(z.string().regex(/^[a-z0-9-]{1,80}$/))
      .min(1)
      .max(MAX_IDS),
  )

/** `?ids=` or `?destinations=`, never both. */
export const hotelsQuerySchema = z.union([
  z.object({ ids: idList, destinations: z.undefined() }),
  z.object({ ids: z.undefined(), destinations: idList }),
])

/** `?bbox=west,south,east,north`: the box, or an issue when it is out of order or too wide. */
export const bboxSchema = z
  .string()
  .regex(BBOX_PATTERN)
  .transform((value, context) => {
    const box = parseBox(value)
    if (!box) context.addIssue({ code: 'custom', message: `At most ${MAX_BOX_SPAN_DEG}° a side, west < east` })
    return box ?? z.NEVER
  })

export const BBOX_ERROR = `Pass bbox alone: west,south,east,north, at most ${MAX_BOX_SPAN_DEG}° a side`
export const QUERY_ERROR = `Pass ids or destinations: 1…${MAX_IDS} comma-separated ids`
export const CATALOG_ERROR = 'Catalog unavailable'

const photoSchema = component(
  'Photo',
  z
    .object({
      id: z.string(),
      caption: z.string(),
      tone: z
        .number()
        .int()
        .min(0)
        .max(PHOTO_TONE_COUNT - 1)
        .meta({ description: 'Тон заглушки, пока фото нет или оно не загрузилось' }),
      url: z.string().optional().meta({ description: 'Шаблон CDN настоящего фото: `{size}` — размер' }),
    })
    .meta({ description: 'Фото: у настоящего — `url`, у демо — только подпись и тон' }),
)

const rateSchema = component(
  'Rate',
  z.object({
    id: z.string().meta({ description: 'Уникален в своём номере' }),
    meal: z.enum(['none', 'breakfast', 'half-board', 'full-board', 'all-inclusive']),
    cancellation: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('free'), daysBefore: z.number().int().min(0) }),
      z.object({ kind: z.literal('non-refundable') }),
    ]),
    payment: z.enum(['now', 'at-hotel']),
    pricePerNight: z.number().meta({ description: 'Цена номера за ночь, ₽' }),
  }),
)

const roomSchema = component(
  'Room',
  z.object({
    id: z.string().meta({ description: 'Уникален в своём отеле' }),
    name: z.string(),
    area: z.number().nullable().meta({ description: 'м², `null` — неизвестно' }),
    beds: z.string().meta({ description: 'Пусто, когда неизвестно' }),
    capacity: z.number().int().min(1).meta({ description: 'Гостей в одном номере' }),
    photos: z.array(photoSchema),
    amenities: z
      .array(z.string())
      .optional()
      .meta({ description: 'Что в номере, по данным отеля; нет — отель не указал' }),
    rates: z.array(rateSchema).meta({ description: 'Сначала дешёвые' }),
  }),
)

const reviewSchema = component(
  'Review',
  z.object({
    id: z.string(),
    author: z.string(),
    date: z.string().nullable().meta({ description: 'ISO-дата; `null` — источник даты не дал' }),
    score: z.number().min(1).max(10),
    pros: z.string().optional().meta({ description: '«Что было хорошо»' }),
    cons: z.string().optional().meta({ description: '«Что было плохо»' }),
    title: z.string().optional(),
    text: z.string().optional(),
    source: z.enum(['ostrovok', 'tripadvisor']).optional().meta({ description: 'Источник отзыва настоящего отеля' }),
    helpful: z.number().int().min(0).meta({ description: 'Скольким гостям отзыв помог' }),
  }),
)

const summaryShape = {
  id: z.string().meta({ description: 'Настоящий отель — `ota-<master_id>`', examples: ['ota-9096882'] }),
  destinationId: z.string().meta({ examples: ['valencia'] }),
  name: z.string(),
  stayType: z.enum(Object.keys(STAY_TYPES) as [StayType, ...StayType[]]),
  stars: z.literal([0, 1, 2, 3, 4, 5]).meta({ description: '1…5 или 0 — настоящий отель без классификации' }),
  rating: z.number().min(0).max(10).meta({ description: 'Оценка гостей, 0 — оценок ещё нет' }),
  reviewCount: z.number().int().min(0),
  priceFrom: z.number().meta({ description: 'Самый дешёвый тариф за ночь, ₽' }),
  wifiMbps: z.number().nullable().meta({ description: 'Скорость Wi‑Fi, Мбит/с; `null` у настоящего отеля' }),
  workspace: z.boolean().meta({ description: 'Есть место для работы' }),
  isNew: z.boolean().meta({ description: 'Из «недавно добавленных» глобуса на главной' }),
}

/** The hotel of a list: Эвал's `matches`. */
export const hotelSummarySchema = component(
  'HotelSummary',
  z.object(summaryShape).meta({ description: 'Сводка отеля для списка' }),
)
sameType<z.output<typeof hotelSummarySchema>, HotelSummary>()

export const hotelSchema = component(
  'Hotel',
  z
    .object({
      ...summaryShape,
      address: z.string(),
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      distanceKm: z.number().meta({ description: 'По прямой до центра города, км' }),
      metro: z
        .object({ station: z.string(), meters: z.number().meta({ description: 'Пешком, м' }) })
        .nullable()
        .meta({ description: 'Ближайшее метро; `null` — нет метро или не рядом' }),
      amenities: z.array(z.enum(Object.keys(AMENITIES) as [Amenity, ...Amenity[]])),
      sectionScores: z.array(z.object({ label: z.enum(SCORE_SECTIONS), score: z.number().min(1).max(10) })),
      description: z.string(),
      checkInTime: z.string().meta({ examples: ['15:00'] }),
      checkOutTime: z.string().meta({ examples: ['12:00'] }),
      photos: z.array(photoSchema),
      guestPhotos: z.array(photoSchema),
      rooms: z.array(roomSchema).meta({ description: 'Сначала дешёвые' }),
      reviews: z.array(reviewSchema).meta({ description: 'Выборка, сначала новые; всего — `reviewCount`' }),
    })
    .meta({ description: 'Отель каталога' }),
)
sameType<z.output<typeof hotelSchema>, Hotel>()

export const hotelsResponseSchema = component('HotelsResponse', z.object({ hotels: z.array(hotelSchema) }))
export type HotelsResponse = z.output<typeof hotelsResponseSchema>

/** The `{hotelId}` of the hotel's routes. */
export const hotelIdParameter = {
  name: 'hotelId',
  in: 'path',
  required: true,
  description: 'Id отеля: настоящий — `ota-<master_id>`',
  schema: z.string().regex(/^[a-z0-9-]{1,80}$/),
  example: 'ota-9096882',
} as const

export const hotelsOperations: ApiOperation[] = [
  {
    method: 'get',
    path: '/api/hotels',
    operationId: 'getHotels',
    tags: ['Отели'],
    summary: 'Отели по id, городам или рамке карты',
    description: [
      'Ровно один параметр:',
      '- `ids` — избранное, поездки, бронирование: в порядке id, неизвестные пропущены;',
      '- `destinations` — поиск и его карта, город за городом;',
      `- \`bbox\` — карта вокруг отеля: отели в рамке, не больше ${MAX_BOX_SPAN_DEG}° по каждой стороне.`,
      '',
      'В production — только настоящие отели (`ota-…`), в preview и development — и демо.',
    ].join('\n'),
    parameters: [
      {
        name: 'ids',
        in: 'query',
        description: `Id отелей через запятую, 1…${MAX_IDS}`,
        schema: idList,
        example: idsExample.query.ids,
      },
      {
        name: 'destinations',
        in: 'query',
        description: `Id городов через запятую, 1…${MAX_IDS}`,
        schema: idList,
        example: destinationsExample.query.destinations,
      },
      {
        name: 'bbox',
        in: 'query',
        description: `Рамка \`запад,юг,восток,север\` в градусах, не больше ${MAX_BOX_SPAN_DEG}° по стороне; только одна`,
        schema: z.string().regex(BBOX_PATTERN),
        example: bboxExample.query.bbox,
      },
    ],
    responses: {
      200: {
        description: 'Отели',
        schema: hotelsResponseSchema,
        headers: cacheHeader,
        examples: {
          ids: { summary: `По id: ${idsExample.query.ids}`, value: idsExample.response },
          bbox: {
            summary: `Рамка: ${bboxExample.query.bbox}`,
            description: 'Первые 3 отеля рамки; у каждого 1 номер, 2 фото и 1 отзыв',
            value: bboxExample.response,
          },
          destinations: {
            summary: `Город: ${destinationsExample.query.destinations}`,
            description: 'Первые 2 отеля города; у каждого 1 номер, 2 фото и 1 отзыв',
            value: destinationsExample.response,
          },
        },
      },
      400: {
        description: 'Нет параметра, их несколько или значение неверное',
        schema: errorSchema,
        examples: {
          query: { summary: 'Нет ids и destinations', value: { error: QUERY_ERROR } },
          bbox: { summary: 'Неверная рамка', value: { error: BBOX_ERROR } },
        },
      },
      503: {
        description: 'Каталог недоступен',
        schema: errorSchema,
        examples: { catalog: { summary: 'Supabase не ответил', value: { error: CATALOG_ERROR } } },
      },
    },
    geo: true,
  },
]
