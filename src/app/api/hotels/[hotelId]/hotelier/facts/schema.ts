import { z } from 'zod'
import { HOTELIER_KEYS } from '@/lib/hotelierFacts'
import { component, errorSchema, type ApiOperation } from '@/lib/openapi/operation'
import { hotelIdParameter } from '../../../schema'

/** `GET /api/hotels/{hotelId}/hotelier/facts`: the hotelier's current characteristics of a real hotel. */

export const NOT_FOUND_ERROR = 'No such real hotel'
export const STORE_ERROR = 'The store is unavailable'

/** Read fresh: an answer of the hotelier counts at once. */
export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const

export const hotelierFactSchema = component(
  'HotelierFact',
  z
    .object({
      id: z.string(),
      characteristic: z.enum(HOTELIER_KEYS).meta({ description: 'Ключ словаря: `room.balcony`, `room.window_side`…' }),
      label: z.string().meta({ description: '«Балкон в номере»' }),
      room: z.string().nullable().meta({ description: 'Тип номера, как его назвал отельер; `null` — об отеле' }),
      value: z.string().meta({ description: '«да», «на запад», «4–5 этажи»' }),
      status: z.literal('reported').meta({ description: 'Сообщено отельером' }),
      confidence: z.number().nullable().meta({ description: '0,75 по политике `confidence-1` (`owner_answer`)' }),
      observedAt: z.string().nullable().meta({ description: 'Когда отельер это ответил' }),
      conflict: z.boolean().meta({ description: 'Другой действующий ответ о той же характеристике говорит иное' }),
      demo: z.boolean().meta({ description: 'Демонстрационные данные: показываются с пометкой «демо»' }),
      limitations: z.array(z.string()),
      source: z
        .object({
          title: z.string(),
          excerpt: z.string().nullable().meta({ description: 'Безличные сведения из ответа, без данных гостя' }),
          retrievedAt: z.string().nullable(),
        })
        .nullable(),
    })
    .meta({ description: 'Характеристика отеля со слов отельера' }),
)
export type HotelierFactView = z.output<typeof hotelierFactSchema>

export const hotelierFactsResponseSchema = component(
  'HotelierFactsResponse',
  z.object({ hotelId: z.string(), facts: z.array(hotelierFactSchema) }),
)
export type HotelierFactsResponse = z.output<typeof hotelierFactsResponseSchema>

export const hotelierFactsOperations: ApiOperation[] = [
  {
    method: 'get',
    path: '/api/hotels/{hotelId}/hotelier/facts',
    operationId: 'getHotelierFacts',
    tags: ['Знания об отеле'],
    summary: 'Сведения отельера',
    description:
      'Действующие характеристики настоящего отеля со слов его отельера (утверждения `hotelier.*`, `reported`): значение, номер, дата ответа, уверенность, источник. Отозванные и заменённые не входят; противоречащие друг другу отмечены `conflict`. Демонстрационные — `demo: true`. Читается без кэша.',
    parameters: [hotelIdParameter],
    responses: {
      200: {
        description: 'Сведения (возможно, ни одного)',
        schema: hotelierFactsResponseSchema,
        examples: {
          demo: {
            summary: 'Демо-ответ отельера',
            value: {
              hotelId: 'ota-9096882',
              facts: [
                {
                  id: '6f1c1d6e-2f4a-4c55-9d3b-0b9a3f1e2a10',
                  characteristic: 'room.balcony',
                  label: 'Балкон в номере',
                  room: 'Superior',
                  value: 'да',
                  status: 'reported',
                  confidence: 0.75,
                  observedAt: '2026-10-21T09:00:00.000Z',
                  conflict: false,
                  demo: true,
                  limitations: ['Сообщено отельером, сервис это не проверял'],
                  source: {
                    title: 'Ответ отельера на вопрос: Есть ли балкон в номерах Superior?',
                    excerpt: 'Со слов отельера, номера Superior: балкон в номере — да.',
                    retrievedAt: '2026-10-21T09:00:00.000Z',
                  },
                },
              ],
            },
          },
        },
      },
      404: { description: 'Нет такого отеля, он скрыт или демонстрационный', schema: errorSchema },
      503: { description: 'Хранилище не читается', schema: errorSchema },
    },
  },
]
