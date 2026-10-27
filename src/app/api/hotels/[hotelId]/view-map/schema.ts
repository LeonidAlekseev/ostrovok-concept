import { z } from 'zod'
import { countRu } from '@/lib/format'
import { VIEW_MAP_RADIUS_M } from '@/lib/view'
import type { ViewMap } from '@/lib/db/view'
import { cacheHeader, component, sameType, type ApiOperation } from '@/lib/openapi/operation'
import { hotelIdParameter } from '../../schema'
import viewMapExample from '@/lib/openapi/examples/view-map.json'

/** `GET /api/hotels/{hotelId}/view-map`: the buildings of EUBUCCO around the hotel, GeoJSON. */

/** A GeoJSON polygon or multipolygon: `[lon, lat]` rings. */
export const polygonSchema = component(
  'Polygon',
  z
    .object({
      type: z.enum(['Polygon', 'MultiPolygon']),
      coordinates: z.unknown().meta({ description: 'Кольца `[lon, lat]` GeoJSON', type: 'array' }),
    })
    .meta({ description: 'Геометрия GeoJSON' }),
)

export const viewMapSchema = component(
  'ViewMap',
  z
    .object({
      type: z.literal('FeatureCollection'),
      features: z.array(
        z.object({
          type: z.literal('Feature'),
          geometry: polygonSchema,
          properties: z.object({
            id: z.string().meta({ description: 'Здание EUBUCCO' }),
            height: z.number().meta({ description: 'Высота, м' }),
            estimated: z.boolean().meta({ description: 'Высота — оценка модели EUBUCCO' }),
          }),
        }),
      ),
    })
    .meta({ description: `Здания EUBUCCO в ${VIEW_MAP_RADIUS_M} м от отеля с высотами` }),
)
sameType<z.output<typeof viewMapSchema>, ViewMap>()

export const viewMapResponseSchema = component(
  'ViewMapResponse',
  z.object({
    map: viewMapSchema
      .nullable()
      .meta({ description: '`null` — демо-отель, неизвестный, скрытый в этом окружении или ошибка' }),
  }),
)
export type ViewMapResponse = z.output<typeof viewMapResponseSchema>

export const viewMapOperations: ApiOperation[] = [
  {
    method: 'get',
    path: '/api/hotels/{hotelId}/view-map',
    operationId: 'getHotelViewMap',
    tags: ['Гео отеля'],
    summary: 'Здания вокруг отеля',
    description: 'Карта «Вид из отеля» (`ViewMap`): контуры зданий EUBUCCO с высотами, GeoJSON.',
    parameters: [hotelIdParameter],
    responses: {
      200: {
        description: 'Карта или `null`',
        schema: viewMapResponseSchema,
        headers: cacheHeader,
        examples: {
          real: {
            summary: 'ota-9096882',
            description: `${countRu(viewMapExample.map.features.length, ['здание', 'здания', 'зданий'])} из ответа`,
            value: viewMapExample,
          },
        },
      },
    },
    geo: true,
  },
]
