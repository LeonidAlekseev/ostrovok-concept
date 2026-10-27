import { z } from 'zod'
import type { ClaimEvidence, ClaimValue, HotelClaim } from '@/lib/db/claims'
import { cacheHeader, component, errorSchema, sameType, type ApiOperation } from '@/lib/openapi/operation'
import { hotelIdParameter } from '../../schema'
import claimsExample from '@/lib/openapi/examples/claims.json'
import estimateExample from '@/lib/openapi/examples/claims-estimate.json'
import { NOISE_ESTIMATE_DOC } from '../noiseEstimateDoc'

/** `GET /api/hotels/{hotelId}/claims`: what the store of claims knows of a real hotel, with its sources. */

/** At most this many claims an answer: the default and the largest `limit`. */
export const CLAIMS_DEFAULT_LIMIT = 100
export const CLAIMS_MAX_LIMIT = 200

export const NOT_FOUND_ERROR = 'Hotel not found'
export const STORE_ERROR = 'Knowledge store unavailable'

/** `?property=`: a dotted prefix such as `noise.` or `noise.nearby.`; empty for all the properties. */
export const claimsQuerySchema = z.object({
  property: z
    .string()
    .regex(/^[A-Za-z0-9_.]*$/)
    .max(100)
    .default(''),
  limit: z.coerce.number().int().min(1).max(CLAIMS_MAX_LIMIT).default(CLAIMS_DEFAULT_LIMIT),
})
export const CLAIMS_QUERY_ERROR = `Pass property as a dotted prefix of letters, digits, _ and . (at most 100) and limit 1…${CLAIMS_MAX_LIMIT}`

export const evidenceSchema = component(
  'Evidence',
  z
    .object({
      id: z.string(),
      role: z.enum(['source', 'input']).nullable().meta({
        description: '`source` — утверждение сообщает это; `input` — вход расчёта; `null` — не при утверждении',
      }),
      type: z.string().meta({ description: '`dataset`, `osm`, `review`, `ota_page`, `calculation`' }),
      title: z.string(),
      provider: z.string().meta({ description: '`EEA`, `OpenStreetMap`, `Островок`' }),
      externalId: z.string().nullable().meta({ description: 'Id у источника: набор, `node/123`, отзыв' }),
      url: z.string().nullable().meta({ description: 'Только если источник его даёт' }),
      retrievedAt: z.string().nullable(),
      excerpt: z.string().nullable().meta({ description: 'Слова источника, на которых держится утверждение' }),
      datasetId: z.string().nullable(),
    })
    .meta({ description: 'Источник утверждения: набор данных, элемент OSM, отзыв, страница Островка' }),
)
sameType<z.output<typeof evidenceSchema>, ClaimEvidence>()

const valueSchema = component(
  'ClaimValue',
  z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('number'), value: z.number() }),
      z.object({
        kind: z.literal('range'),
        min: z.number().nullable().meta({ description: '`null` — открыт снизу' }),
        max: z.number().nullable().meta({ description: '`null` — открыт сверху' }),
      }),
      z.object({ kind: z.literal('text'), value: z.string() }),
      z.object({ kind: z.literal('boolean'), value: z.boolean() }),
      z.object({ kind: z.literal('json'), value: z.unknown() }),
    ])
    .meta({ description: 'Значение: число, диапазон, текст, логическое или JSON — ровно одно' }),
)
sameType<z.output<typeof valueSchema>, ClaimValue>()

const record = z.record(z.string(), z.unknown())

export const claimSchema = component(
  'Claim',
  z
    .object({
      id: z.string(),
      property: z.string().meta({ description: 'Стабильный id через точку: `noise.lnight.roadsInAgglomeration`' }),
      sourceKey: z
        .string()
        .meta({ description: 'Различает утверждения одного свойства: слой EEA, элемент OSM, отзыв' }),
      value: valueSchema,
      unit: z.string().nullable().meta({ description: '`dB`, `m`, `count`; `null` для текста и логического' }),
      status: z.enum(['observed', 'reported', 'derived', 'inferred']).meta({
        description:
          'Эпистемический статус: `observed` — измерено или увидено, `reported` — так говорит источник, `derived` — посчитано, `inferred` — вывод модели',
      }),
      confidence: z
        .number()
        .nullable()
        .meta({ description: 'От 0 до 1 по политике уверенности; `null` — у уверенности нет основания' }),
      method: record.meta({ description: 'Как значение прочитано или посчитано' }),
      observedAt: z.string().nullable(),
      validFrom: z.string().nullable(),
      validTo: z.string().nullable(),
      limitations: z.array(z.string()).meta({ description: 'Чего значение не говорит' }),
      calculation: z
        .object({
          id: z.string(),
          method: z.string(),
          version: z.string(),
          inputs: record,
          parameters: record,
          limitations: z.array(z.string()),
          computedAt: z.string(),
        })
        .nullable()
        .meta({ description: 'Расчёт производного значения; `null` у не производных' }),
      evidence: z.array(evidenceSchema),
    })
    .meta({ description: 'Утверждение об отеле со значением, статусом, уверенностью, расчётом и источниками' }),
)
sameType<z.output<typeof claimSchema>, HotelClaim>()

export const claimsResponseSchema = component(
  'ClaimsResponse',
  z.object({
    hotelId: z.string(),
    property: z.string().meta({ description: 'Префикс запроса' }),
    claims: z.array(claimSchema).meta({
      description:
        'По свойству, потом по `sourceKey`. Пустой список ничего не говорит об отеле: хранилище может не знать',
    }),
    truncated: z.boolean().meta({ description: '`true` — утверждений больше, чем `limit`: сузьте `property`' }),
  }),
)
export type ClaimsResponse = z.output<typeof claimsResponseSchema>

export const claimsOperations: ApiOperation[] = [
  {
    method: 'get',
    path: '/api/hotels/{hotelId}/claims',
    operationId: 'getHotelClaims',
    tags: ['Знания об отеле'],
    summary: 'Характеристики отеля',
    description: `Утверждения хранилища знаний о настоящем отеле Валенсии: значение (число, диапазон, текст, логическое), единица, эпистемический статус, уверенность, источники (\`evidence\`) и расчёт для производных значений. Фильтр \`property\` — префикс свойства: \`noise.\`, \`noise.estimate.\`, \`building.\`, \`noise.nearby.\`. Отель, которого нет, скрытый или демонстрационный, даёт 404.\n\n${NOISE_ESTIMATE_DOC}`,
    parameters: [
      hotelIdParameter,
      {
        name: 'property',
        in: 'query',
        description: 'Префикс свойства: `noise.`, `noise.estimate.`, `building.`, `noise.nearby.`; пусто — все',
        schema: claimsQuerySchema.shape.property,
        example: 'noise.lnight.',
      },
      {
        name: 'limit',
        in: 'query',
        description: `Не больше утверждений в ответе: 1…${CLAIMS_MAX_LIMIT}, по умолчанию ${CLAIMS_DEFAULT_LIMIT}`,
        schema: z.string().regex(/^\d{1,3}$/),
        example: '20',
      },
    ],
    responses: {
      200: {
        description: 'Утверждения (возможно, ни одного)',
        schema: claimsResponseSchema,
        headers: cacheHeader,
        examples: {
          real: {
            summary: 'ota-9096882, `noise.lnight.`',
            description: `${claimsExample.response.claims.length} утверждений из ответа`,
            value: claimsExample.response,
          },
          estimate: {
            summary: `${estimateExample.hotel}, \`${estimateExample.query.property}\``,
            description: `Оценка шума у фасада: ${estimateExample.response.claims.length} утверждений из ответа`,
            value: estimateExample.response,
          },
        },
      },
      400: { description: 'Недопустимый `property` или `limit`', schema: errorSchema },
      404: { description: 'Нет такого отеля, он скрыт в этом окружении или демонстрационный', schema: errorSchema },
      503: { description: 'Хранилище не читается', schema: errorSchema },
    },
  },
]
