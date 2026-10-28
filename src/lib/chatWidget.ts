import { z } from 'zod'
import { NOISY_CATEGORIES, type HotelNoise } from './noise'
import type { Tone } from './view'

/**
 * The widget of Эвал's answer in a hotel's chat: the block of the hotel page the question is about, in the feed.
 * - `noise` — «Шум и окружение»: the noise map by day and by night and the estimate at the facade to the street and to
 *   the yard (noise-estimate-v1) with its sources; the data are the ones the answer was told from.
 * - `view` — «Вид из отеля»: the map of the lines of sight from the floor asked (the top one when none is), turned to
 *   the side of what is asked, with the verdicts; the lines themselves are read from the page's route
 *   (`GET /api/hotels/<id>/view`), the places the answer looked up besides the page's are in `places`.
 * The widget is the answer's picture: the text of the answer says the same without it.
 */

const hotelSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(300),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
})
export type WidgetHotel = z.infer<typeof hotelSchema>

const bandSchema = z.object({ min: z.number().optional(), max: z.number().optional() })
const sourceSchema = z.object({
  source: z.string().max(100),
  lden: bandSchema.optional(),
  lnight: bandSchema.optional(),
})

/** At most this many loud places: `NOISY_PER_CATEGORY` of each category. */
export const MAX_WIDGET_PLACES = 200

const noiseSchema = z.object({
  sources: z.array(sourceSchema).max(20),
  yard: z.array(sourceSchema).max(20),
  zone: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('building'), buildingId: z.string().max(100), bufferM: z.number() }),
      z.object({ kind: z.literal('circle'), radiusM: z.number() }),
    ])
    .nullable(),
  places: z
    .array(
      z.object({
        category: z.enum(NOISY_CATEGORIES),
        name: z.string().max(300).nullable(),
        distanceM: z.number(),
        lat: z.number(),
        lon: z.number(),
      }),
    )
    .max(MAX_WIDGET_PLACES),
  placesCovered: z.array(z.enum(NOISY_CATEGORIES)).max(NOISY_CATEGORIES.length),
})

export const VIEW_FOCUSES = ['sea', 'sunset', 'sunrise'] as const
export type ViewFocus = (typeof VIEW_FOCUSES)[number]

const TONES = ['seen', 'partly', 'closed', 'unknown'] as const satisfies readonly Tone[]

/** At most this many places the answer looked up. */
export const MAX_VIEW_PLACES = 12

/** A place the answer looked up besides the page's (a kind of place, a named one): its verdict from the floor. */
const viewPlaceSchema = z.object({
  name: z.string().min(1).max(300),
  category: z.string().max(200),
  lat: z.number(),
  lon: z.number(),
  distanceM: z.number(),
  tone: z.enum(TONES),
  verdict: z.string().max(100),
  /** EUBUCCO's buildings in the way from the floor. */
  blockers: z.array(z.string().max(100)).max(50),
})
export type ViewPlace = z.infer<typeof viewPlaceSchema>

export const chatWidgetSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('noise'), hotel: hotelSchema, noise: noiseSchema }),
    z.object({
      kind: z.literal('view'),
      hotel: hotelSchema,
      /** The floor asked; `null` — the top one. */
      floor: z.number().int().min(1).max(200).nullable(),
      /** The day of the sunset and the sunrise, `YYYY-MM-DD`. */
      date: z.iso.date(),
      /** What is asked: the map turns to the side of the first. */
      focus: z.array(z.enum(VIEW_FOCUSES)).max(VIEW_FOCUSES.length),
      places: z.array(viewPlaceSchema).max(MAX_VIEW_PLACES),
    }),
  ])
  .meta({ description: 'Виджет ответа в чате об отеле: карта шума или карта вида из окна' })
export type ChatWidget = z.infer<typeof chatWidgetSchema>
export type NoiseWidget = Extract<ChatWidget, { kind: 'noise' }>
export type ViewWidget = Extract<ChatWidget, { kind: 'view' }>

/** The widget of a stored answer; anything off the shape reads as none. */
export function parseChatWidget(value: unknown): ChatWidget | undefined {
  const parsed = chatWidgetSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

/** The widget of «Шум и окружение» for the hotel's noise data. */
export const noiseWidget = (hotel: WidgetHotel, noise: HotelNoise): NoiseWidget => ({
  kind: 'noise',
  hotel: { id: hotel.id, name: hotel.name, lat: hotel.lat, lon: hotel.lon },
  noise: { ...noise, places: noise.places.slice(0, MAX_WIDGET_PLACES) },
})
