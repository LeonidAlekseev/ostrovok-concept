import { z } from 'zod'
import { PLACE_CATEGORIES } from '@/lib/geo/categories'
import type { HotelRelation } from '@/lib/db/knowledge'
import { cacheHeader, component, errorSchema, sameType, type ApiOperation } from '@/lib/openapi/operation'
import { hotelIdParameter } from '../../schema'
import { claimSchema, NOT_FOUND_ERROR, STORE_ERROR } from '../claims/schema'
import { evidenceSchema } from '../claims/schema'
import relationsExample from '@/lib/openapi/examples/relations.json'

/** `GET /api/hotels/{hotelId}/relations`: the graph of a real hotel (KAG): its places and its building. */

export { NOT_FOUND_ERROR, STORE_ERROR }

export const RELATIONS_DEFAULT_LIMIT = 50
export const RELATIONS_MAX_LIMIT = 100

/** `?predicate=` and `?category=`: a predicate (`near`, `nearest_building`) and a category of src/lib/geo/categories.ts. */
export const relationsQuerySchema = z.object({
  predicate: z
    .string()
    .regex(/^[a-z][a-z_]{0,40}$/)
    .optional(),
  category: z.enum(PLACE_CATEGORIES).optional(),
  limit: z.coerce.number().int().min(1).max(RELATIONS_MAX_LIMIT).default(RELATIONS_DEFAULT_LIMIT),
})
export const RELATIONS_QUERY_ERROR = `Pass predicate (lowercase, _), category (one of ${PLACE_CATEGORIES.join(', ')}) and limit 1…${RELATIONS_MAX_LIMIT}`

export const relationSchema = component(
  'Relation',
  z
    .object({
      id: z.string(),
      predicate: z.string().meta({ description: '`near` — место рядом; `nearest_building` — здание отеля' }),
      confidence: z.number().nullable().meta({ description: 'Уверенность связи, 0…1; `null` — нет основания' }),
      object: z.object({
        kind: z.string().meta({ description: '`osm_place`, `building`, `ota_poi`' }),
        ref: z.string().meta({ description: 'Ключ у источника: `node/123`' }),
        name: z.string().nullable(),
        lat: z.number().nullable().meta({ description: '`null` — у здания и у места, которого нет в кэше OSM' }),
        lon: z.number().nullable(),
        categories: z.array(z.string()).meta({ description: 'Категории места: `pharmacy`, `bar`…' }),
      }),
      claim: claimSchema.nullable().meta({ description: 'Значение связи, например расстояние, со своей уверенностью' }),
      evidence: evidenceSchema.nullable().meta({ description: 'Источник связи' }),
    })
    .meta({ description: 'Связь отеля с местом или зданием' }),
)
sameType<z.output<typeof relationSchema>, HotelRelation>()

export const relationsResponseSchema = component(
  'RelationsResponse',
  z.object({
    hotelId: z.string(),
    relations: z.array(relationSchema).meta({
      description: 'Ближайшие первыми. Пустой список ничего не говорит об отеле: OSM и хранилище могут не знать мест',
    }),
    truncated: z.boolean().meta({ description: '`true` — связей больше, чем `limit`' }),
  }),
)
export type RelationsResponse = z.output<typeof relationsResponseSchema>

export const relationsOperations: ApiOperation[] = [
  {
    method: 'get',
    path: '/api/hotels/{hotelId}/relations',
    operationId: 'getHotelRelations',
    tags: ['Знания об отеле'],
    summary: 'Связи отеля с местами',
    description:
      'Граф знаний (KAG) настоящего отеля Валенсии: связь `near` с местами рядом (аптека, магазин, остановка, шумные места) и `nearest_building` со зданием. У связи — объект (вид, ключ, имя, координаты, категории), расстояние как утверждение с уверенностью и источником, уверенность связи. Координаты и категории берутся из кэша OSM. Отель, которого нет, скрытый или демонстрационный, даёт 404; пустой список не значит «рядом ничего нет».',
    parameters: [
      hotelIdParameter,
      {
        name: 'predicate',
        in: 'query',
        description: 'Предикат связи: `near`, `nearest_building`; пусто — все',
        schema: relationsQuerySchema.shape.predicate,
        example: 'near',
      },
      {
        name: 'category',
        in: 'query',
        description: 'Категория места: аптека `pharmacy`, `bar` и другие; пусто — все',
        schema: relationsQuerySchema.shape.category,
        example: 'pharmacy',
      },
      {
        name: 'limit',
        in: 'query',
        description: `Не больше связей: 1…${RELATIONS_MAX_LIMIT}, по умолчанию ${RELATIONS_DEFAULT_LIMIT}`,
        schema: z.string().regex(/^\d{1,3}$/),
        example: '5',
      },
    ],
    responses: {
      200: {
        description: 'Связи (возможно, ни одной)',
        schema: relationsResponseSchema,
        headers: cacheHeader,
        examples: {
          real: {
            summary: 'ota-9096882, `near` `pharmacy`',
            description: `${relationsExample.response.relations.length} связей из ответа`,
            value: relationsExample.response,
          },
        },
      },
      400: { description: 'Недопустимые `predicate`, `category` или `limit`', schema: errorSchema },
      404: { description: 'Нет такого отеля, он скрыт в этом окружении или демонстрационный', schema: errorSchema },
      503: { description: 'Хранилище не читается', schema: errorSchema },
    },
    geo: true,
  },
]
