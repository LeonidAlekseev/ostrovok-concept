import type { Row } from './query'

/**
 * `osm_places_near` and `osm_places_named` (supabase/migrations/20261026130000_osm_places.sql,
 * 20261029190000_osm_places_named_words.sql) over the snapshot's places: the distances on the WGS84 ellipsoid in the
 * plane around the point (exact to centimetres within the 50 km of the function), a line or an area by its shape.
 */

interface Point {
  lat: number
  lon: number
}

const A = 6378137
const E2 = 0.00669437999014

/** Metres a degree of latitude and of longitude at `lat`. */
function scale(lat: number) {
  const phi = (lat * Math.PI) / 180
  const s = 1 - E2 * Math.sin(phi) ** 2
  const meridian = (A * (1 - E2)) / s ** 1.5
  const normal = A / Math.sqrt(s)
  return { y: (meridian * Math.PI) / 180, x: (normal * Math.cos(phi) * Math.PI) / 180 }
}

type Shape = { type: string; coordinates: unknown }

/** The rings or the lines of a shape, in [lon, lat]. */
function partsOf(shape: Shape): { lines: number[][][]; polygons: number[][][][] } {
  const c = shape.coordinates as never
  switch (shape.type) {
    case 'LineString':
      return { lines: [c], polygons: [] }
    case 'MultiLineString':
      return { lines: c, polygons: [] }
    case 'Polygon':
      return { lines: [], polygons: [c] }
    case 'MultiPolygon':
      return { lines: [], polygons: c }
    default:
      return { lines: [], polygons: [] }
  }
}

const inRing = (x: number, y: number, ring: readonly number[][]) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const inPolygon = (x: number, y: number, rings: readonly number[][][]) =>
  inRing(x, y, rings[0]) && !rings.slice(1).some((hole) => inRing(x, y, hole))

/** The distance (m) from the point to the place and the place's nearest point. */
export function distanceTo(point: Point, place: Row): { distance: number; near: Point } {
  const k = scale(point.lat)
  const shape = place.geometry as Shape | undefined
  if (!shape) {
    const dx = (Number(place.lon) - point.lon) * k.x
    const dy = (Number(place.lat) - point.lat) * k.y
    return { distance: Math.hypot(dx, dy), near: { lat: Number(place.lat), lon: Number(place.lon) } }
  }
  const { lines, polygons } = partsOf(shape)
  if (polygons.some((rings) => inPolygon(point.lon, point.lat, rings))) return { distance: 0, near: point }
  let best = { distance: Infinity, near: point }
  const segments = [...lines, ...polygons.flat()]
  for (const line of segments)
    for (let i = 1; i < line.length; i += 1) {
      const ax = (line[i - 1][0] - point.lon) * k.x
      const ay = (line[i - 1][1] - point.lat) * k.y
      const bx = (line[i][0] - point.lon) * k.x
      const by = (line[i][1] - point.lat) * k.y
      const dx = bx - ax
      const dy = by - ay
      const len = dx * dx + dy * dy
      const t = len === 0 ? 0 : Math.min(Math.max(-(ax * dx + ay * dy) / len, 0), 1)
      const x = ax + t * dx
      const y = ay + t * dy
      const d = Math.hypot(x, y)
      if (d < best.distance) best = { distance: d, near: { lon: point.lon + x / k.x, lat: point.lat + y / k.y } }
    }
  return best
}

/** The areas loaded ahead cover the circle: its four extremes and its centre are inside. */
function covers(area: Row, point: Point, radiusM: number) {
  const shape = area.geometry as Shape | undefined
  if (!shape) return false
  const k = scale(point.lat)
  const dLat = radiusM / k.y
  const dLon = radiusM / k.x
  const probes = [
    [point.lon, point.lat],
    [point.lon + dLon, point.lat],
    [point.lon - dLon, point.lat],
    [point.lon, point.lat + dLat],
    [point.lon, point.lat - dLat],
  ]
  const { polygons } = partsOf(shape)
  return probes.every(([x, y]) => polygons.some((rings) => inPolygon(x, y, rings)))
}

const round1 = (v: number) => Math.round(v * 10) / 10
const round6 = (v: number) => Math.round(v * 1e6) / 1e6

export function nearPlaces(
  places: readonly Row[],
  areas: readonly Row[],
  {
    lat,
    lon,
    radiusM,
    wanted,
    perCategory,
  }: { lat: number; lon: number; radiusM: number; wanted: readonly string[]; perCategory: number },
) {
  const r = Math.min(Math.max(radiusM, 1), 50_000)
  const point = { lat, lon }
  const covered = [...new Set(wanted)]
    .filter((cat) => areas.some((a) => (a.categories as string[]).includes(cat) && covers(a, point, r)))
    .sort()
  const hits = wanted.flatMap((cat) =>
    places
      .filter((p) => (p.categories as string[]).includes(cat))
      .map((p) => ({ p, ...distanceTo(point, p) }))
      .filter((h) => h.distance <= r)
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          String(a.p.osm_type).localeCompare(String(b.p.osm_type)) ||
          Number(a.p.osm_id) - Number(b.p.osm_id),
      )
      .slice(0, perCategory)
      .map((h) => ({ cat, ...h })),
  )
  hits.sort((a, b) => (a.cat < b.cat ? -1 : a.cat > b.cat ? 1 : a.distance - b.distance))
  return {
    covered,
    places: hits.map(({ cat, p, distance, near }) => ({
      category: cat,
      osm_type: p.osm_type,
      osm_id: p.osm_id,
      name: p.name,
      categories: p.categories,
      tags: p.tags,
      lat: p.lat,
      lon: p.lon,
      distance_m: round1(distance),
      near_lat: round6(near.lat),
      near_lon: round6(near.lon),
      origin: p.origin,
      fetched_at: p.fetched_at,
      attribution: p.attribution,
    })),
  }
}

/** `place_name_key`: lower case without accents, the words split by anything else. */
export const placeNameKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** pg_trgm's trigrams of a text: each word padded with two spaces before and one after. */
function trigrams(text: string): Set<string> {
  const set = new Set<string>()
  for (const word of text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    const padded = `  ${word} `
    for (let i = 0; i + 3 <= padded.length; i += 1) set.add(padded.slice(i, i + 3))
  }
  return set
}

/** pg_trgm's `similarity`. */
export function similarity(a: string, b: string): number {
  const x = trigrams(a)
  const y = trigrams(b)
  if (x.size === 0 || y.size === 0) return 0
  let common = 0
  for (const t of x) if (y.has(t)) common += 1
  return common / (x.size + y.size - common)
}

const GENERIC = new Set(
  'тц трц торговый торговая центр моль mall centro comercial cc hotel отель hostal hostel restaurante restaurant ресторан cafe кафе bar бар'.split(
    ' ',
  ),
)

export function namedPlaces(places: readonly Row[], q: string, maxPlaces: number) {
  const key = placeNameKey(q)
  if (!key) return []
  const words = key.split(' ').filter((w) => w && !GENERIC.has(w))
  const mall = /(^| )(тц|трц|торговый|торговая|моль|mall|comercial)( |$)/.test(key)
  const scored = places.flatMap((o) => {
    const tags = (o.tags ?? {}) as Record<string, string>
    const names = [o.name as string, tags['name:ru'], tags['name:es'], tags['name:ca'], tags['name:en']].filter(
      (n): n is string => typeof n === 'string',
    )
    if (names.length === 0) return []
    const score = Math.max(
      ...names.map((n) => {
        const nameKey = placeNameKey(n)
        const nameWords = nameKey.split(' ')
        const sim = similarity(nameKey, key)
        const whole =
          words.join('').length >= 4 && words.every((w) => nameWords.includes(w))
            ? 0.7 + (0.25 * words.length) / nameWords.length + (mall && tags.shop === 'mall' ? 0.1 : 0)
            : 0
        return Math.max(sim, whole)
      }),
    )
    return score >= 0.65 ? [{ o, score, exact: score >= 0.999 }] : []
  })
  const anyExact = scored.some((s) => s.exact)
  return scored
    .filter((s) => s.exact || !anyExact)
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(a.o.osm_type).localeCompare(String(b.o.osm_type)) ||
        Number(a.o.osm_id) - Number(b.o.osm_id),
    )
    .slice(0, maxPlaces)
    .map(({ o }) => ({
      osm_type: o.osm_type,
      osm_id: o.osm_id,
      name: o.name,
      categories: o.categories,
      tags: o.tags,
      lat: o.lat,
      lon: o.lon,
      origin: o.origin,
      attribution: o.attribution,
    }))
}
