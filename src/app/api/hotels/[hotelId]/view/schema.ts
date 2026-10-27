import { z } from 'zod'
import { LANDMARK_RADIUS_M, RAY_ANGLES, SEA_RADIUS_M, SIDES, type HotelView, type SideId } from '@/lib/view'
import { cacheHeader, component, sameType, type ApiOperation } from '@/lib/openapi/operation'
import { hotelIdParameter } from '../../schema'
import viewExample from '@/lib/openapi/examples/view.json'

/** `GET /api/hotels/{hotelId}/view`: «Вид из отеля» for every floor at once. */

const metres = (description: string) => z.number().meta({ description })
const eyeHeight = (description: string) => z.number().nullable().meta({ description })

const blockerSchema = component(
  'LineBlocker',
  z
    .object({
      id: z.string().meta({ description: 'Здание EUBUCCO' }),
      distanceM: metres('От отеля, м'),
      heightM: metres('Высота по EUBUCCO, м'),
      heightLowerM: metres('Нижняя граница интервала высоты, м'),
      heightUpperM: metres('Верхняя граница интервала высоты, м'),
      estimated: z.boolean().meta({ description: 'Высота — оценка модели EUBUCCO, а не измерение' }),
      eyeLowerM: metres('Глаз выше этого проходит над зданием по нижней границе высоты, м'),
      eyeM: metres('То же по высоте EUBUCCO, м'),
      eyeUpperM: metres('То же по верхней границе, м'),
    })
    .meta({ description: 'Здание на линии взгляда' }),
)

const sightLineSchema = component(
  'SightLine',
  z
    .object({
      distanceM: metres('От отеля до цели, м'),
      checked: z.boolean().meta({ description: 'Измерена: не длиннее 6 км, координаты хорошие' }),
      crossed: z.number().int().min(0).meta({ description: 'Зданий на линии, кроме отеля и цели' }),
      coveredM: z
        .number()
        .nullable()
        .meta({ description: 'Насколько линия в границах муниципалитета València или над морем, м' }),
      eyes: z
        .array(
          z.object({
            eyeM: eyeHeight('Самый низкий глаз над всеми зданиями, м; `null` — зданий нет'),
            eyeLowerM: eyeHeight('То же по нижним границам высот'),
            eyeUpperM: eyeHeight('То же по верхним границам высот'),
            blockers: z.array(blockerSchema).meta({ description: 'Помехи самых высоких глаз, сначала высокие' }),
          }),
        )
        .meta({ description: `По углам ${RAY_ANGLES.join('° и ')}° для луча горизонта; одна для цели` }),
      targetBuilding: z
        .object({ id: z.string(), heightM: z.number().nullable(), estimated: z.boolean() })
        .nullable()
        .meta({ description: 'Здание в точке цели: видна его крыша' }),
    })
    .meta({ description: 'Линия взгляда от отеля, как её измерила `hotel_view_eyes`' }),
)

const targetSchema = component(
  'ViewTarget',
  z
    .object({
      kind: z.enum(['sea', 'attraction', 'ostrovok', 'place']),
      name: z.string(),
      category: z.string().meta({ examples: ['музей'] }),
      lat: z.number(),
      lon: z.number(),
      distanceM: metres('От отеля, м'),
      bearing: z.number().meta({ description: 'Азимут от отеля, °' }),
      line: sightLineSchema.nullable(),
    })
    .meta({ description: 'Место, видимость которого проверена' }),
)

export const hotelViewSchema = component(
  'HotelView',
  z
    .object({
      window: z
        .object({
          source: z.enum(['building', 'rooms']).meta({
            description: '`building` — здание EUBUCCO в точке отеля; `rooms` — этажи номеров по Островку',
          }),
          floors: z.number().int().min(1).meta({ description: 'Верхний этаж: этажи 1…floors' }),
          storeyM: metres('Высота этажа, м'),
          heightM: z.number().nullable().meta({ description: 'Высота здания, м; `null` для `rooms`' }),
          estimated: z.boolean().meta({ description: 'Высота глаза — оценка' }),
        })
        .meta({ description: 'Этажи, на которых может быть окно' }),
      ownBuilding: z.string().nullable().meta({ description: 'Здание EUBUCCO, из которого идут линии' }),
      rays: z
        .array(z.object({ bearing: z.number(), line: sightLineSchema }))
        .meta({ description: 'Лучи горизонта по азимутам' }),
      sea: z.array(targetSchema).meta({ description: `Точки берега в ${SEA_RADIUS_M / 1000} км, сначала ближние` }),
      seaChecked: z.boolean().meta({ description: 'Берег OpenStreetMap загружен' }),
      landmarks: z
        .array(targetSchema)
        .meta({ description: `Достопримечательности OSM и места Островка в ${LANDMARK_RADIUS_M / 1000} км` }),
      windowSides: z
        .array(
          z.object({
            rgHash: z.string(),
            roomName: z.string(),
            sides: z.array(z.enum(SIDES.map((s) => s.id) as [SideId, ...SideId[]])),
            source: z.enum(['hotel', 'ostrovok']),
          }),
        )
        .meta({ description: 'Сторона окон типов номеров; пока всегда пусто' }),
    })
    .meta({ description: '«Вид из отеля» для всех этажей сразу' }),
)
sameType<z.output<typeof hotelViewSchema>, HotelView>()

export const viewResponseSchema = component(
  'HotelViewResponse',
  z.object({
    view: hotelViewSchema.nullable().meta({
      description:
        '`null` — демо-отель, неизвестный, скрытый в этом окружении, без высоты здания и этажей номеров или ошибка',
    }),
  }),
)
export type ViewResponse = z.output<typeof viewResponseSchema>

export const viewOperations: ApiOperation[] = [
  {
    method: 'get',
    path: '/api/hotels/{hotelId}/view',
    operationId: 'getHotelView',
    tags: ['Гео отеля'],
    summary: 'Вид из отеля',
    description:
      'Линии взгляда над зданиями EUBUCCO для всех этажей: лучи горизонта, берег моря, достопримечательности. Для страницы отеля (`HotelView`); итог с этажа считается на клиенте без новых запросов.',
    parameters: [hotelIdParameter],
    responses: {
      200: {
        description: 'Вид или `null`',
        schema: viewResponseSchema,
        headers: cacheHeader,
        examples: {
          real: {
            summary: 'ota-9096882',
            description: 'Каждый 10-й из 120 лучей, не больше 2 помех на высоту глаза',
            value: viewExample,
          },
          none: { summary: 'Нет данных', value: { view: null } },
        },
      },
    },
    geo: true,
  },
]
