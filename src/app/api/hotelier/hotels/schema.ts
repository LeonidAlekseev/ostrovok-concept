import { z } from 'zod'
import type { HotelierHotel } from '@/lib/db/claims'
import { cacheHeader, component, errorSchema, sameType, type ApiOperation } from '@/lib/openapi/operation'

/** `GET /api/hotelier/hotels`: the hotels with the characteristics of their hotelier. */

export const HOTELS_STORE_ERROR = 'The store is unavailable'

export const hotelierHotelSchema = component(
  'HotelierHotel',
  z.object({
    hotelId: z.string(),
    facts: z.number().meta({ description: 'Действующих характеристик со слов отельера' }),
    demo: z.boolean().meta({ description: 'Среди них есть демонстрационные: показываются с пометкой «демо»' }),
  }),
)
sameType<z.output<typeof hotelierHotelSchema>, HotelierHotel>()

export const hotelierHotelsResponseSchema = component(
  'HotelierHotelsResponse',
  z.object({ hotels: z.array(hotelierHotelSchema) }),
)
export type HotelierHotelsResponse = z.output<typeof hotelierHotelsResponseSchema>

export const hotelierHotelsOperations: ApiOperation[] = [
  {
    method: 'get',
    path: '/api/hotelier/hotels',
    operationId: 'listHotelierHotels',
    tags: ['Знания об отеле'],
    summary: 'Отели со сведениями отельера',
    description:
      'Отели, о которых отельер сообщил действующие характеристики (утверждения `hotelier.*`), с их числом и признаком демонстрационных данных. Выдача поиска помечает их «Сведения отельера».',
    responses: {
      200: {
        description: 'Отели (возможно, ни одного)',
        schema: hotelierHotelsResponseSchema,
        headers: cacheHeader,
        examples: {
          demo: { summary: 'Демо-данные', value: { hotels: [{ hotelId: 'ota-9096882', facts: 3, demo: true }] } },
        },
      },
      503: { description: 'Хранилище не читается', schema: errorSchema },
    },
  },
]
