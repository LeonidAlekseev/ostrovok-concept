import { z } from 'zod'
import { countRu } from '@/lib/format'
import { NOISE_MAP_RADIUS_M } from '@/lib/noise'
import type { NoiseMap } from '@/lib/db/noise'
import { cacheHeader, component, sameType, type ApiOperation } from '@/lib/openapi/operation'
import { hotelIdParameter } from '../../schema'
import { polygonSchema } from '../view-map/schema'
import noiseMapExample from '@/lib/openapi/examples/noise-map.json'
import { NOISE_ESTIMATE_DOC } from '../noiseEstimateDoc'

/** `GET /api/hotels/{hotelId}/noise-map`: the EEA noise around the hotel, GeoJSON. */

const decibels = (description: string) => z.number().nullable().meta({ description })

export const noiseMapSchema = component(
  'NoiseMap',
  z
    .object({
      type: z.literal('FeatureCollection'),
      features: z.array(
        z.object({
          type: z.literal('Feature'),
          geometry: polygonSchema,
          properties: z.object({
            source: z.string().meta({ description: 'Слой EEA (дороги, ж/д, аэропорт, агломерация) или `quiet`' }),
            indicator: z.enum(['Lday', 'Lnight']),
            db_min: decibels('Нижняя граница полосы, дБ'),
            db_max: decibels('Верхняя граница, дБ; `null` — открыта сверху'),
            level: decibels('дБ, по которому кусок раскрашен; `null` — тишина или нет оценки'),
          }),
        }),
      ),
    })
    .meta({ description: `Шум EEA в ${NOISE_MAP_RADIUS_M} м от отеля: полосы ночью, оценка днём и тишина` }),
)
sameType<z.output<typeof noiseMapSchema>, NoiseMap>()

export const noiseMapResponseSchema = component(
  'NoiseMapResponse',
  z.object({
    map: noiseMapSchema
      .nullable()
      .meta({ description: '`null` — демо-отель, неизвестный, скрытый в этом окружении или ошибка' }),
  }),
)
export type NoiseMapResponse = z.output<typeof noiseMapResponseSchema>

export const noiseMapOperations: ApiOperation[] = [
  {
    method: 'get',
    path: '/api/hotels/{hotelId}/noise-map',
    operationId: 'getHotelNoiseMap',
    tags: ['Гео отеля'],
    summary: 'Шум вокруг отеля',
    description: `Карта «Шум и окружение» (\`NoiseMap\`): контуры шума EEA, GeoJSON. Уровни у фасада отеля — в утверждениях \`noise.estimate.*\` (\`GET /api/hotels/{hotelId}/claims?property=noise.estimate.\`).\n\n${NOISE_ESTIMATE_DOC}`,
    parameters: [hotelIdParameter],
    responses: {
      200: {
        description: 'Карта или `null`',
        schema: noiseMapResponseSchema,
        headers: cacheHeader,
        examples: {
          real: {
            summary: 'ota-7481548',
            description: `${countRu(noiseMapExample.map.features.length, ['кусок', 'куска', 'кусков'])} из ответа`,
            value: noiseMapExample,
          },
        },
      },
    },
    geo: true,
  },
]
