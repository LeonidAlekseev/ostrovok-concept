import {
  categorize,
  isShape,
  overpassStatements,
  shapeFilters,
  type PlaceCategory,
  type StoredCategory,
  type Tags,
} from './categories'
import type { Bbox, LatLon } from './distance'
import { osmJson, type CallBudget } from './http'
import type { RateGate } from './limits'
import { ok, timedOut, unavailable, type GeoResult } from './result'

/**
 * Overpass (overpass-api.de): the places of the categories around a point, for what the cache does not cover, and
 * of a rectangle, for the loading script. Ported from osmmcp's `find_nearby_places`; the query building and the
 * parsing are pure and tested on fixtures.
 */

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
/** Within the turn's 9 s: the query's own `[timeout:]` says the same to the server. */
export const OVERPASS_TIMEOUT_MS = 4000

export type OsmType = 'node' | 'way' | 'relation'
const OSM_TYPES = new Set<OsmType>(['node', 'way', 'relation'])

/** A row of `osm_places` without the columns the database fills. */
export interface OsmPlaceRow extends LatLon {
  osm_type: OsmType
  osm_id: number
  name: string | null
  categories: StoredCategory[]
  tags: Tags
  /** EWKT, `SRID=4326;POINT(lon lat)` / `LINESTRING(…)` / `POLYGON((…))`: PostGIS reads it into `geography`. */
  geom: string
}

export type OverpassArea = { around: LatLon & { radiusM: number } } | { bbox: Bbox }

/**
 * The query of `categories` in `area`: points with their centres, and the ways of the shape categories (beaches, the
 * coast, parks) with their geometry, so distances are measured to the edge.
 */
export function overpassQuery(categories: readonly PlaceCategory[], area: OverpassArea, timeoutS: number): string {
  const filter =
    'around' in area ? `(around:${Math.round(area.around.radiusM)},${area.around.lat},${area.around.lon})` : ''
  const header =
    'bbox' in area
      ? `[out:json][timeout:${timeoutS}][bbox:${area.bbox.south},${area.bbox.west},${area.bbox.north},${area.bbox.east}];`
      : `[out:json][timeout:${timeoutS}];`
  const lines = [header, `(${overpassStatements(categories, filter).join('')})->.all;`]
  const shapes = shapeFilters(categories)
  if (shapes.length === 0) lines.push('.all out tags center qt;')
  else
    lines.push(
      `(${shapes.map((f) => `way.all${f};`).join('')})->.shapes;`,
      '(.all; - .shapes;)->.points;',
      '.points out tags center qt;',
      '.shapes out tags geom qt;',
    )
  return lines.join('\n')
}

const round = (n: number) => Math.round(n * 1e7) / 1e7
const pair = ({ lat, lon }: LatLon) => `${round(lon)} ${round(lat)}`

const isPoint = (value: unknown): value is LatLon =>
  !!value &&
  typeof value === 'object' &&
  Number.isFinite((value as LatLon).lat) &&
  Number.isFinite((value as LatLon).lon)

/** The name to show: the local one, else the Spanish, Valencian or English one. */
export const placeName = (tags: Tags): string | null =>
  tags.name ?? tags['name:es'] ?? tags['name:ca'] ?? tags['name:en'] ?? null

/** The shape and the centre of a way's geometry: a closed ring is a polygon, anything else a line. */
function wayShape(points: LatLon[]): { geom: string; centre: LatLon } | undefined {
  if (points.length < 2) return undefined
  const first = points[0]
  const last = points[points.length - 1]
  const closed = points.length >= 4 && first.lat === last.lat && first.lon === last.lon
  if (closed) {
    const lats = points.map((p) => p.lat)
    const lons = points.map((p) => p.lon)
    const centre = {
      lat: round((Math.min(...lats) + Math.max(...lats)) / 2),
      lon: round((Math.min(...lons) + Math.max(...lons)) / 2),
    }
    return { geom: `SRID=4326;POLYGON((${points.map(pair).join(',')}))`, centre }
  }
  // The middle vertex of a line lies on it: the marker of the coast is on the water.
  const middle = points[Math.floor(points.length / 2)]
  return { geom: `SRID=4326;LINESTRING(${points.map(pair).join(',')})`, centre: middle }
}

/** One element of an Overpass answer as a row; `undefined` for one of no category or without coordinates. */
export function elementRow(element: unknown): OsmPlaceRow | undefined {
  if (!element || typeof element !== 'object') return undefined
  const e = element as Record<string, unknown>
  if (!OSM_TYPES.has(e.type as OsmType)) return undefined
  const type = e.type as OsmType
  const id = Number(e.id)
  if (!Number.isSafeInteger(id)) return undefined
  const tags = Object.fromEntries(
    Object.entries((e.tags as Record<string, unknown> | undefined) ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
  const categories = categorize(tags)
  if (categories.length === 0) return undefined
  const base = { osm_type: type, osm_id: id, name: placeName(tags), categories, tags }
  if (type === 'node' && isPoint(e)) {
    return { ...base, lat: round(e.lat), lon: round(e.lon), geom: `SRID=4326;POINT(${pair(e)})` }
  }
  if (type === 'way' && Array.isArray(e.geometry) && isShape(tags)) {
    const shape = wayShape(e.geometry.filter(isPoint))
    if (shape) return { ...base, ...shape.centre, geom: shape.geom }
  }
  if (isPoint(e.center)) {
    const centre = { lat: round(e.center.lat), lon: round(e.center.lon) }
    return { ...base, ...centre, geom: `SRID=4326;POINT(${pair(centre)})` }
  }
  return undefined
}

/**
 * The rows of an Overpass JSON answer, each element once. An answer whose `remark` reports a runtime error (the
 * server's timeout, out of memory) is a failure: its elements are only a part.
 */
export function parseOverpass(json: unknown): GeoResult<OsmPlaceRow[]> {
  if (!json || typeof json !== 'object' || !Array.isArray((json as { elements?: unknown }).elements))
    return unavailable('overpass')
  const { elements, remark } = json as { elements: unknown[]; remark?: unknown }
  if (typeof remark === 'string' && /runtime error/i.test(remark))
    return /timed? ?out/i.test(remark) ? timedOut('overpass') : unavailable('overpass')
  const rows = new Map<string, OsmPlaceRow>()
  for (const element of elements) {
    const row = elementRow(element)
    if (row) rows.set(`${row.osm_type}/${row.osm_id}`, row)
  }
  return ok([...rows.values()])
}

export interface OverpassDeps {
  budget: CallBudget
  gate: RateGate
  fetch?: typeof fetch
  url?: string
  timeoutMs?: number
}

/** Asks Overpass for `categories` in `area` and parses the answer. */
export async function overpassPlaces(
  categories: readonly PlaceCategory[],
  area: OverpassArea,
  { url = OVERPASS_URL, timeoutMs = OVERPASS_TIMEOUT_MS, ...deps }: OverpassDeps,
): Promise<GeoResult<OsmPlaceRow[]>> {
  const left = deps.budget.deadline - Date.now()
  const ms = Math.min(timeoutMs, left)
  const query = overpassQuery(categories, area, Math.max(1, Math.floor(ms / 1000)))
  const answer = await osmJson({
    service: 'overpass',
    url,
    timeoutMs: ms,
    ...deps,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }).toString(),
    },
  })
  return answer.ok ? parseOverpass(answer.value) : answer
}
