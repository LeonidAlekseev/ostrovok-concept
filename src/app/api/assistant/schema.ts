import { z } from 'zod'
import {
  MAX_HISTORY,
  MAX_MESSAGE_LENGTH,
  MAX_PHOTOS,
  VIBE_LABEL,
  type AssistantResponse,
  type Brief,
  type VibeId,
} from '@/lib/assistant'
import { VIEW_LABEL, type HotelFeatures, type ViewKind } from '@/lib/features'
import type { ChatMap } from '@/lib/geo/chatMap'
import { MAX_PHOTO_URL_LENGTH, PHOTO_DATA_URL } from '@/lib/ai/vision'
import { RATE_LIMIT } from '@/lib/ai/rateLimit'
import { toolRunSchema } from '@/lib/toolResult'
import { MAX_BOOKINGS, type DateChange, type TripBooking } from '@/lib/trips'
import { component, errorSchema, sameType, type ApiOperation } from '@/lib/openapi/operation'
import { hotelSummarySchema } from '../hotels/schema'
import geoExample from '@/lib/openapi/examples/assistant-geo.json'
import noiseExample from '@/lib/openapi/examples/assistant-noise.json'
import wishExample from '@/lib/openapi/examples/assistant-wish.json'
import knowledgeExample from '@/lib/openapi/examples/assistant-knowledge.json'
import tripsExample from '@/lib/openapi/examples/assistant-trips.json'

/** `POST /api/assistant`: the traveller's newest message to Эвал and its answer. */

const isoDate = z.iso.date()
const cancellationSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('free'), daysBefore: z.number().int().min(0).max(365) }),
    z.object({ kind: z.literal('non-refundable') }),
  ])
  .meta({ description: 'Условия отмены: бесплатно за `daysBefore` дней до заезда или невозвратный тариф' })
const amount = z.number().min(0).max(100_000_000)
const bookingId = z
  .string()
  .regex(/^OS-[A-Z0-9]{6}$/)
  .meta({ examples: ['OS-7K2Q9Z'] })

/**
 * A booking of this browser as Эвал gets it: without the guests' names, the contacts, the requests and the card (the
 * fields unknown here are dropped). Untrusted: only the shape is checked, the hotel and its rate are read from the
 * catalogue again.
 */
const tripBookingSchema = component(
  'TripBooking',
  z
    .object({
      id: bookingId,
      createdAt: z.string().max(40),
      status: z.enum(['confirmed', 'cancelled']),
      hotelId: z.string().min(1).max(120),
      roomId: z.string().min(1).max(200),
      rateId: z.string().min(1).max(200),
      checkIn: isoDate,
      checkOut: isoDate,
      guests: z.object({
        adults: z.number().int().min(1).max(30),
        children: z.number().int().min(0).max(30),
        rooms: z.number().int().min(1).max(30),
      }),
      payment: z.enum(['now', 'at-hotel']),
      total: amount.meta({ description: 'За всё проживание и все номера, ₽' }),
      cancellation: cancellationSchema,
      cancelledAt: z.string().max(40).optional(),
      cancellationFee: amount.optional().meta({ description: 'Удержано при отмене, ₽' }),
    })
    .meta({ description: 'Бронирование браузера без имён гостей, контактов, пожеланий и карты' }),
)
sameType<z.output<typeof tripBookingSchema>, TripBooking>()

/** The change of the dates Эвал proposes: applied only in the browser, after «Подтвердить». */
const dateChangeSchema = component(
  'DateChange',
  z
    .object({
      bookingId,
      from: z
        .object({ checkIn: isoDate, checkOut: isoDate, total: amount })
        .meta({ description: 'Бронирование, каким его посчитали: изменение применяется только к нему' }),
      checkIn: isoDate,
      checkOut: isoDate,
      total: amount.meta({ description: 'Цена тарифа брони на новые даты, как при бронировании, ₽' }),
      cancellation: cancellationSchema,
    })
    .meta({
      description: 'Предложение сменить даты брони: новая цена и условия отмены; без «Подтвердить» не меняется ничего',
    }),
)
sameType<z.output<typeof dateChangeSchema>, DateChange>()

export const assistantRequestSchema = z
  .object({
    messages: z
      .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) }))
      .min(1)
      .max(MAX_HISTORY)
      .meta({ description: 'Диалог по порядку; последнее — сообщение путешественника' }),
    brief: z.record(z.string(), z.unknown()).default({}).meta({
      description:
        'Бриф `Brief` из прошлого ответа; неизвестные и неверные поля отбрасываются. `hotelId` — чат об отеле',
    }),
    // The parameters changed by hand: the hotels by the brief, the dialog only for the wish's words.
    rerun: z
      .literal(true)
      .optional()
      .meta({ description: 'Параметры изменены вручную: отели по брифу, последнее сообщение не читается' }),
    // About 4 × 300 KB of optimised photos: the body stays within the 4.5 MB of a Vercel function.
    photos: z
      .array(z.string().max(MAX_PHOTO_URL_LENGTH).regex(PHOTO_DATA_URL))
      .max(MAX_PHOTOS)
      .optional()
      .meta({ description: 'Фото последнего сообщения: data URL WebP или JPEG' }),
    chatId: z.uuid().optional().meta({
      description:
        'Чат вошедшего пользователя: сервер проверяет, что чат его, и записывает запуски инструментов в `tool_runs`',
    }),
    messageId: z.uuid().optional().meta({ description: 'Ожидающий ответ хода: запуски записываются с ним' }),
    bookings: z.array(tripBookingSchema).max(MAX_BOOKINGS).optional().meta({
      description:
        'Чат о поездках (`brief.trips`): бронирования браузера без личных данных. Сервер читает их для ответа и не хранит',
    }),
  })
  .refine(({ messages, rerun }) => rerun || messages.at(-1)?.role === 'user', 'The last message is the traveller’s')

const briefSchema = component(
  'Brief',
  z
    .object({
      vibe: z.enum([...(Object.keys(VIBE_LABEL) as VibeId[]), 'any']).optional(),
      destinationId: z.string().optional(),
      when: z
        .union([z.number().int().min(0).max(11), z.enum(['soon', 'any'])])
        .optional()
        .meta({ description: 'Месяц с 0, «поскорее» или «всё равно»' }),
      dates: z
        .object({ checkIn: z.string(), checkOut: z.string() })
        .optional()
        .meta({ description: 'Названные дни поездки, ISO' }),
      datesRejected: z.literal(true).optional().meta({ description: 'Названные дни прошли, невозможны или длинные' }),
      nights: z.number().int().optional(),
      party: z.enum(['solo', 'couple', 'family', 'friends', 'any']).optional(),
      mood: z.enum(['calm', 'active']).optional(),
      budget: z.number().optional().meta({ description: 'Бюджет на всю поездку, ₽' }),
      quiet: z.literal(true).optional().meta({ description: 'Тихо ночью' }),
      height: z.enum(['high', 'low']).optional(),
      view: z.enum([...(Object.keys(VIEW_LABEL) as ViewKind[]), 'any']).optional(),
      seaMaxM: z.number().optional().meta({ description: 'Море не дальше, м' }),
      guests: z.object({ adults: z.number().int(), children: z.number().int(), rooms: z.number().int() }).optional(),
      hotelId: z.string().optional().meta({ description: 'Отель чата: Эвал отвечает о нём' }),
      trips: z.literal(true).optional().meta({ description: 'Чат о бронированиях: Эвал отвечает по `bookings`' }),
      bookingId: bookingId.optional().meta({ description: 'Бронь, из которой открыт чат' }),
    })
    .meta({ description: 'Что известно о поездке' }),
)
sameType<z.output<typeof briefSchema>, Brief>()

const band = z.object({ min: z.number().optional(), max: z.number().optional() })

const featuresSchema = component(
  'HotelFeatures',
  z
    .object({
      floors: z.number().optional(),
      heightM: z.number().optional(),
      lden: band.optional().meta({ description: 'Самая громкая полоса шума за сутки, дБ' }),
      lnight: band.optional().meta({ description: 'Самая громкая полоса ночью, дБ' }),
      views: z.array(z.object({ roomName: z.string(), view: z.enum(Object.keys(VIEW_LABEL) as [ViewKind]) })),
      buildingDoubtful: z.literal(true).optional().meta({ description: 'Здание в точке отеля сомнительно' }),
      seaM: z.number().optional().meta({ description: 'До берега OpenStreetMap, м' }),
    })
    .meta({ description: 'Здание, шум и виды номеров' }),
)
sameType<z.output<typeof featuresSchema>, HotelFeatures>()

const chatMapSchema = component(
  'ChatMap',
  z
    .object({
      points: z.array(
        z.object({
          lat: z.number(),
          lon: z.number(),
          kind: z.enum(['hotel', 'place']),
          label: z.string(),
          category: z
            .string()
            .optional()
            .meta({ examples: ['аптека'] }),
          distanceM: z.number().optional().meta({ description: 'От отеля по прямой, м' }),
          source: z.literal('ostrovok').optional().meta({ description: 'Место со страницы Островка; иначе OSM' }),
        }),
      ),
      routes: z.array(
        z.object({
          mode: z.enum(['foot', 'car', 'straight']),
          distanceM: z.number(),
          durationS: z.number(),
          coordinates: z.array(z.tuple([z.number(), z.number()])).meta({ description: '`[lon, lat]` GeoJSON' }),
          to: z.string().meta({ description: 'Подпись точки, куда ведёт маршрут' }),
        }),
      ),
      attribution: z.string(),
    })
    .meta({ description: 'Карта ответа об отеле: отель, найденные места и маршруты к ним' }),
)

/**
 * The run of a tool of the contract (src/lib/toolResult.ts, docs/tools.md): its id (the row of `tool_runs` for a
 * signed-in user) and its result with the sources, the characteristics, the calculations and the limitations.
 */
const toolRunComponent = component(
  'ToolRun',
  toolRunSchema.meta({
    description:
      'Запуск инструмента: `id` и `result` — статус, итог, источники (`evidence`, только из базы), характеристики с происхождением (`claims`), расчёты, ограничения, ошибка',
  }),
)

export const assistantResponseSchema = component(
  'AssistantResponse',
  z
    .object({
      brief: briefSchema,
      reply: z.string().optional().meta({ description: 'Реплика модели; нет — ответили правила' }),
      source: z.enum(['model', 'rules']),
      matches: z.array(hotelSummarySchema).optional().meta({ description: 'Отели поиска по смыслу, лучшие первыми' }),
      features: z.record(z.string(), featuresSchema).optional().meta({ description: 'Данные `matches` по id' }),
      missing: z
        .array(z.enum(['sea', 'quiet', 'height', 'view']))
        .optional()
        .meta({ description: 'Критерии, по которым ни у одного отеля нет данных' }),
      steps: z
        .array(
          z.object({
            agent: z.enum(['search', 'features', 'vision', 'geo', 'trips']),
            title: z.string(),
            params: z.string().optional(),
            status: z.enum(['done', 'failed']),
            result: z.string().optional(),
            run: toolRunComponent.optional(),
          }),
        )
        .optional()
        .meta({ description: 'Шаги хода по порядку' }),
      unverified: z.string().optional().meta({ description: 'Часть ответа об отеле из общих знаний модели' }),
      photo: z
        .object({
          action: z.enum(['ask', 'similar', 'refine', 'unseen', 'limited', 'skipped', 'unusable']),
          seen: z.string().optional(),
          like: z.string().optional(),
          missed: z.literal(true).optional(),
        })
        .optional()
        .meta({ description: 'Что вышло с фото запроса' }),
      modelsDown: z.literal(true).optional().meta({ description: 'Ни одна модель не ответила, ответили правила' }),
      map: chatMapSchema.optional(),
      findings: z.string().optional().meta({
        description:
          'Ответ инструментов хранилища при подборе: отели с характеристиками, местами рядом и отзывами, по которым они подобраны (только данные запусков `steps[].run`)',
      }),
      change: dateChangeSchema.optional(),
    })
    .meta({ description: 'Ответ Эвала' }),
)
sameType<z.output<typeof assistantResponseSchema>, AssistantResponse>()
sameType<z.output<typeof chatMapSchema>, ChatMap>()

export const assistantOperations: ApiOperation[] = [
  {
    method: 'post',
    path: '/api/assistant',
    operationId: 'askAssistant',
    tags: ['Эвал'],
    summary: 'Сообщение Эвалу',
    description: [
      'Новое сообщение путешественника:',
      '- с `brief.hotelId` — вопрос об отеле: ответ из данных отеля, о местах рядом и маршрутах — с картой `map`, о виде из окон — по линиям взгляда, о шуме — по инструменту «Анализ шума» (шаг с `run`);',
      '- с `brief.trips` — вопрос о бронированиях `bookings`: детали брони (шаг «Бронирования» с `run`) или смена дат — пересчёт цены тарифа и условий отмены (шаг «Пересчёт при смене дат», предложение `change`); применяет изменение браузер после «Подтвердить», сервер брони не хранит;',
      '- с `photos` — найти похожие отели или учесть фото в запросе;',
      '- иначе — пожелание: бриф дополняется, а когда он полный — отели `matches` поиска по смыслу; пожелание о шуме, местах рядом или отзывах подбирается инструментами хранилища (шаги с `run`, ответ `findings`).',
      '',
      `Отвечает за 15 с (с фото — за 28 с). Не больше ${RATE_LIMIT} запросов в минуту с одного адреса. Модели и их ключи — только на сервере.`,
    ].join('\n'),
    body: {
      description: 'Диалог и бриф',
      schema: assistantRequestSchema,
      examples: {
        geo: { summary: 'Об отеле: места рядом и маршрут', value: geoExample.request },
        noise: { summary: 'Об отеле: шум', value: noiseExample.request },
        wish: { summary: 'Пожелание с полным брифом', value: wishExample.request },
        knowledge: { summary: 'Подбор: аптека рядом и тихо ночью', value: knowledgeExample.request },
        trips: { summary: 'Поездки: перенести бронь на другие даты', value: tripsExample.request },
      },
    },
    responses: {
      200: {
        description: 'Ответ',
        schema: assistantResponseSchema,
        examples: {
          geo: {
            summary: 'Аптека рядом с ota-9096882',
            description: 'Точки отеля и места, пеший маршрут',
            value: geoExample.response,
          },
          noise: {
            summary: 'Шум у ota-9096882',
            description: 'Шаг «Анализ шума» с запуском `run`: источники EEA и OpenStreetMap, характеристики, расчёты',
            value: noiseExample.response,
          },
          knowledge: {
            summary: 'Аптека рядом и тихо ночью в Валенсии',
            description:
              'Шаги «Отели по характеристикам», «Места рядом» с запусками `run` (характеристики по отелям в `groups`) и ответ `findings`; первые 3 отеля `matches`',
            value: knowledgeExample.response,
          },
          trips: {
            summary: 'Перенос брони на другие даты',
            description:
              'Шаг «Пересчёт при смене дат» с запуском `run` (цена тарифа из каталога, расчёт, условия отмены) и предложение `change`',
            value: tripsExample.response,
          },
          wish: {
            summary: 'Тихий отель у моря в Валенсии',
            description: 'Первые 3 отеля `matches` и их `features`',
            value: wishExample.response,
          },
        },
      },
      400: { description: 'Тело не по схеме', schema: errorSchema },
      429: { description: `Больше ${RATE_LIMIT} запросов в минуту`, schema: errorSchema },
      503: { description: 'Каталог недоступен', schema: errorSchema },
    },
    geo: true,
  },
]
