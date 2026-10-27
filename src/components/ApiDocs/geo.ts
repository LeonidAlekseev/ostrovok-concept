import type { Hotel } from '@/lib/catalog'
import type { NoiseMap } from '@/lib/db/noise'
import type { ViewMap } from '@/lib/db/view'
import type { ChatMap } from '@/lib/geo/chatMap'
import { NOISE_COLORS, NOISE_UNKNOWN_COLOR, QUIET_SOURCE, noiseColor } from '@/lib/noise'
import { pointAt, reachOf, reachTone, type HotelView, type SightLine, type ViewWindow } from '@/lib/view'
import { BUILDING_COLOR, ESTIMATED_BUILDING_COLOR, HOTEL_BUILDING_COLOR, TONE_COLOR } from '../HotelPage/viewColors'

/**
 * What the map of the docs page (`/api/docs`) draws of an answer of a geo route: the hotels, the view's rays and
 * targets, the buildings, the noise, Эвал's places and routes. Every feature has its `color` and `label`; the map
 * styles them by `kind`. The colours are the hotel page's.
 */

export type GeoKind = 'hotel' | 'place' | 'line' | 'route' | 'building' | 'noise'

export interface GeoProperties {
  kind: GeoKind
  color: string
  label: string
}

/** The shapes of an answer, `[lon, lat]` as GeoJSON has them. */
type GeoGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'LineString'; coordinates: [number, number][] }
  | { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }

export interface GeoFeature {
  type: 'Feature'
  geometry: GeoGeometry
  properties: GeoProperties
}

export interface GeoAnswer {
  /** What the answer is, for the panel's title: «Шум вокруг отеля». */
  title: string
  features: GeoFeature[]
  /** The credits of the data besides OpenStreetMap's. */
  sources: ('eea' | 'eubucco')[]
}

export interface GeoPoint {
  lat: number
  lon: number
}

export const HOTEL_COLOR = '#0f172a'
export const PLACE_COLOR = '#2563eb'
const ROUTE_COLOR = '#2563eb'

const point = (at: GeoPoint, kind: GeoKind, color: string, label: string): GeoFeature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [at.lon, at.lat] },
  properties: { kind, color, label },
})

const line = (coordinates: [number, number][], kind: GeoKind, color: string, label: string): GeoFeature => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates },
  properties: { kind, color, label },
})

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The hotel route of a path: `/api/hotels/ota-1/view` → `['ota-1', 'view']`. */
export function hotelRoute(path: string): { hotelId: string; part: 'view' | 'view-map' | 'noise-map' } | null {
  const match = /^\/api\/hotels\/([^/]+)\/(view|view-map|noise-map)\/?$/.exec(path)
  return match ? { hotelId: decodeURIComponent(match[1]), part: match[2] as 'view' | 'view-map' | 'noise-map' } : null
}

/** The colour of a line of sight by the floor it is seen from (the hotel page's tones). */
const sightColor = (sight: SightLine | null, window: ViewWindow) => TONE_COLOR[reachTone(reachOf(sight, window))]

function hotels(list: readonly Hotel[]): GeoAnswer {
  return {
    title: `Отели: ${list.length}`,
    features: list.map((hotel) => point(hotel, 'hotel', HOTEL_COLOR, hotel.name)),
    sources: [],
  }
}

/** The rays and the targets from the hotel; its point is the target's minus its bearing when not given. */
function view(data: HotelView, hotel: GeoPoint | null): GeoAnswer {
  const target = [...data.sea, ...data.landmarks][0]
  const origin = hotel ?? (target ? pointAt(target, target.bearing + 180, target.distanceM) : null)
  if (!origin) return { title: 'Вид из отеля', features: [], sources: ['eubucco'] }
  const from: [number, number] = [origin.lon, origin.lat]
  const to = (at: GeoPoint): [number, number] => [at.lon, at.lat]
  return {
    title: 'Вид из отеля',
    features: [
      ...data.rays.map((ray) =>
        line(
          [from, to(pointAt(origin, ray.bearing, ray.line.distanceM))],
          'line',
          sightColor(ray.line, data.window),
          `Луч ${Math.round(ray.bearing)}°`,
        ),
      ),
      ...[...data.sea, ...data.landmarks].flatMap((item) => {
        const color = sightColor(item.line, data.window)
        return [line([from, to(item)], 'line', color, item.name), point(item, 'place', color, item.name)]
      }),
      point(origin, 'hotel', HOTEL_COLOR, 'Отель'),
    ],
    sources: ['eubucco'],
  }
}

function buildings(map: ViewMap, hotel: GeoPoint | null): GeoAnswer {
  return {
    title: 'Здания вокруг отеля',
    features: [
      ...map.features.map((feature): GeoFeature => ({
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
          kind: 'building',
          color: feature.properties.estimated ? ESTIMATED_BUILDING_COLOR : BUILDING_COLOR,
          label: `${feature.properties.height} м`,
        },
      })),
      ...(hotel ? [point(hotel, 'hotel', HOTEL_BUILDING_COLOR, 'Отель')] : []),
    ],
    sources: ['eubucco'],
  }
}

function noise(map: NoiseMap, hotel: GeoPoint | null): GeoAnswer {
  return {
    title: 'Шум вокруг отеля',
    features: [
      ...map.features.map(({ geometry, properties: { level, source, db_min, db_max } }): GeoFeature => ({
        type: 'Feature',
        geometry,
        properties: {
          kind: 'noise',
          color:
            typeof level === 'number'
              ? noiseColor(level)
              : source === QUIET_SOURCE
                ? NOISE_COLORS[0]
                : NOISE_UNKNOWN_COLOR,
          label: source === QUIET_SOURCE ? 'Тише 40 дБ' : `${db_min ?? '…'}–${db_max ?? '…'} дБ`,
        },
      })),
      ...(hotel ? [point(hotel, 'hotel', HOTEL_COLOR, 'Отель')] : []),
    ],
    sources: ['eea'],
  }
}

function chatMap(map: ChatMap): GeoAnswer {
  return {
    title: 'Карта ответа Эвала',
    features: [
      ...map.routes.map((route) => line(route.coordinates, 'route', ROUTE_COLOR, `Маршрут до «${route.to}»`)),
      ...map.points.map((p) =>
        point(p, p.kind === 'hotel' ? 'hotel' : 'place', p.kind === 'hotel' ? HOTEL_COLOR : PLACE_COLOR, p.label),
      ),
    ],
    sources: [],
  }
}

/**
 * The geo of an answer of `path` (`/api/hotels`, `/api/hotels/{id}/view|view-map|noise-map`, `/api/assistant`), or
 * `null` when it has none: an error, `{ view: null }`, an answer of Эвал without a map. `hotel` is the point of the
 * hotel of a hotel route, for its marker.
 */
export function geoOfResponse(path: string, body: unknown, hotel: GeoPoint | null = null): GeoAnswer | null {
  if (!isObject(body)) return null
  let answer: GeoAnswer | null = null
  if (path === '/api/hotels' && Array.isArray(body.hotels) && body.hotels.length > 0)
    answer = hotels(body.hotels as Hotel[])
  else if (path === '/api/assistant' && isObject(body.map)) answer = chatMap(body.map as unknown as ChatMap)
  else {
    const route = hotelRoute(path)
    if (route?.part === 'view' && isObject(body.view)) answer = view(body.view as unknown as HotelView, hotel)
    else if (route?.part === 'view-map' && isObject(body.map)) answer = buildings(body.map as unknown as ViewMap, hotel)
    else if (route?.part === 'noise-map' && isObject(body.map)) answer = noise(body.map as unknown as NoiseMap, hotel)
  }
  return answer && answer.features.length > 0 ? answer : null
}

/** The box of the features, `[west, south, east, north]`. */
export function boundsOf(features: readonly GeoFeature[]): [number, number, number, number] | null {
  let box: [number, number, number, number] | null = null
  const visit = (value: unknown) => {
    if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') {
      const [lon, lat] = value as number[]
      box = box
        ? [Math.min(box[0], lon), Math.min(box[1], lat), Math.max(box[2], lon), Math.max(box[3], lat)]
        : [lon, lat, lon, lat]
    } else if (Array.isArray(value)) value.forEach(visit)
  }
  for (const feature of features) visit(feature.geometry.coordinates)
  return box
}

export interface GeoExample {
  id: string
  /** «Шум вокруг отеля · ota-9096882». */
  title: string
  /** The example's own summary: «ota-9096882». */
  summary: string
  /** The path with its parameters filled with their examples: `/api/hotels/ota-9096882/noise-map`. */
  path: string
  body: unknown
}

interface DocumentOperation {
  summary?: string
  'x-geo'?: boolean
  parameters?: { name: string; in: string; example?: unknown }[]
  responses?: Record<
    string,
    { content?: Record<string, { examples?: Record<string, { summary?: string; value: unknown }> }> }
  >
}

/** The examples of the answers of the geo routes (`x-geo`) of the OpenAPI document, for «Пример на карте». */
export function geoExamples(document: unknown): GeoExample[] {
  const paths = isObject(document) && isObject(document.paths) ? document.paths : {}
  return Object.entries(paths).flatMap(([template, item]) =>
    Object.entries(isObject(item) ? (item as Record<string, DocumentOperation>) : {}).flatMap(([method, op]) => {
      if (!op['x-geo']) return []
      const path = template.replace(/\{(\w+)\}/g, (_, name: string) =>
        String(op.parameters?.find((p) => p.in === 'path' && p.name === name)?.example ?? name),
      )
      const examples = op.responses?.['200']?.content?.['application/json']?.examples ?? {}
      // Only the examples the map can draw: not `{ view: null }`.
      return Object.entries(examples).flatMap(([id, example]) => {
        const answer = geoOfResponse(path, example.value)
        return answer
          ? [
              {
                id: `${method} ${template} ${id}`,
                title: `${answer.title} · ${example.summary ?? id}`,
                summary: example.summary ?? id,
                path,
                body: example.value,
              },
            ]
          : []
      })
    }),
  )
}
