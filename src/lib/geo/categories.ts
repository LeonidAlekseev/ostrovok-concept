/**
 * The categories of places the geo tools know: what the guests of a hotel ask about (design.md of the change
 * `osm-places-cache`). One OSM element may be of several (a restaurant that is an attraction too). No `server-only`:
 * the loading script classifies the same way as the server.
 */

export const PLACE_CATEGORIES = [
  'hospital',
  'clinic',
  'pharmacy',
  'bar',
  'nightclub',
  'restaurant',
  'fast_food',
  'cafe',
  'supermarket',
  'convenience',
  'metro',
  'tram',
  'train_station',
  'bus_stop',
  'airport',
  'beach',
  'sea',
  'park',
  'attraction',
  'viewpoint',
  'museum',
  'centre',
] as const

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number]
/** A category of a stored place: `other` is a geocoded place of none of the categories. */
export type StoredCategory = PlaceCategory | 'other'

export type Tags = Record<string, string>

/** An Overpass statement of the category: the element types and the tag filter. */
interface Selector {
  type: 'nwr' | 'node' | 'way'
  filter: string
}

interface CategoryDef {
  /** For the model and the answers. */
  label: string
  selectors: Selector[]
  matches: (tags: Tags) => boolean
  /** Ways of the category keep their shape: the distance to a beach or the coast is to its edge. */
  shape?: true
}

const is =
  (key: string, ...values: string[]) =>
  (tags: Tags) =>
    tags[key] !== undefined && values.includes(tags[key])
const any =
  (...tests: ((tags: Tags) => boolean)[]) =>
  (tags: Tags) =>
    tests.some((test) => test(tags))
const nwr = (key: string, ...values: string[]): Selector => ({
  type: 'nwr',
  filter: values.length === 1 ? `["${key}"="${values[0]}"]` : `["${key}"~"^(${values.join('|')})$"]`,
})

const STATION = is('railway', 'station', 'halt')
const METRO = (tags: Tags) => STATION(tags) && (tags.station === 'subway' || tags.subway === 'yes')
const TRAM = (tags: Tags) =>
  tags.railway === 'tram_stop' ||
  (STATION(tags) && (tags.station === 'light_rail' || tags.light_rail === 'yes' || tags.tram === 'yes'))
const RAILWAYS = nwr('railway', 'station', 'halt', 'tram_stop')

export const CATEGORY: Record<PlaceCategory, CategoryDef> = {
  hospital: {
    label: 'больница',
    selectors: [nwr('amenity', 'hospital'), nwr('healthcare', 'hospital')],
    matches: any(is('amenity', 'hospital'), is('healthcare', 'hospital')),
  },
  clinic: {
    label: 'клиника или врач',
    selectors: [nwr('amenity', 'clinic', 'doctors'), nwr('healthcare', 'clinic')],
    matches: any(is('amenity', 'clinic', 'doctors'), is('healthcare', 'clinic')),
  },
  pharmacy: {
    label: 'аптека',
    selectors: [nwr('amenity', 'pharmacy'), nwr('healthcare', 'pharmacy')],
    matches: any(is('amenity', 'pharmacy'), is('healthcare', 'pharmacy')),
  },
  bar: { label: 'бар или паб', selectors: [nwr('amenity', 'bar', 'pub')], matches: is('amenity', 'bar', 'pub') },
  nightclub: { label: 'ночной клуб', selectors: [nwr('amenity', 'nightclub')], matches: is('amenity', 'nightclub') },
  restaurant: { label: 'ресторан', selectors: [nwr('amenity', 'restaurant')], matches: is('amenity', 'restaurant') },
  fast_food: { label: 'фастфуд', selectors: [nwr('amenity', 'fast_food')], matches: is('amenity', 'fast_food') },
  cafe: { label: 'кафе', selectors: [nwr('amenity', 'cafe')], matches: is('amenity', 'cafe') },
  supermarket: { label: 'супермаркет', selectors: [nwr('shop', 'supermarket')], matches: is('shop', 'supermarket') },
  convenience: {
    label: 'магазин у дома',
    selectors: [nwr('shop', 'convenience')],
    matches: is('shop', 'convenience'),
  },
  metro: { label: 'станция метро', selectors: [RAILWAYS], matches: METRO },
  tram: { label: 'остановка трамвая', selectors: [RAILWAYS], matches: TRAM },
  train_station: {
    label: 'вокзал или станция поезда',
    selectors: [RAILWAYS],
    matches: (tags) =>
      STATION(tags) &&
      !METRO(tags) &&
      !TRAM(tags) &&
      !['monorail', 'funicular', 'miniature'].includes(tags.station ?? '') &&
      tags.railway !== 'tram_stop',
  },
  bus_stop: {
    label: 'автобусная остановка',
    selectors: [{ type: 'node', filter: '["highway"="bus_stop"]' }],
    matches: is('highway', 'bus_stop'),
  },
  airport: { label: 'аэропорт', selectors: [nwr('aeroway', 'aerodrome')], matches: is('aeroway', 'aerodrome') },
  beach: { label: 'пляж', selectors: [nwr('natural', 'beach')], matches: is('natural', 'beach'), shape: true },
  sea: {
    label: 'берег моря',
    selectors: [{ type: 'way', filter: '["natural"="coastline"]' }],
    matches: is('natural', 'coastline'),
    shape: true,
  },
  park: { label: 'парк', selectors: [nwr('leisure', 'park')], matches: is('leisure', 'park'), shape: true },
  attraction: {
    label: 'достопримечательность',
    selectors: [nwr('tourism', 'attraction')],
    matches: is('tourism', 'attraction'),
  },
  viewpoint: {
    label: 'смотровая площадка',
    selectors: [nwr('tourism', 'viewpoint')],
    matches: is('tourism', 'viewpoint'),
  },
  museum: { label: 'музей', selectors: [nwr('tourism', 'museum')], matches: is('tourism', 'museum') },
  centre: {
    label: 'центр города',
    selectors: [{ type: 'node', filter: '["place"="city"]' }],
    matches: is('place', 'city'),
  },
}

/** The categories of an element by its tags, in the order of `PLACE_CATEGORIES`; empty when none. */
export const categorize = (tags: Tags): PlaceCategory[] => PLACE_CATEGORIES.filter((c) => CATEGORY[c].matches(tags))

/** The Overpass statements for `categories`, each once, with `area` (`(around:…)` or empty for a global bbox). */
export function overpassStatements(categories: readonly PlaceCategory[], area: string): string[] {
  const statements = categories.flatMap((c) => CATEGORY[c].selectors.map((s) => `${s.type}${s.filter}${area};`))
  return [...new Set(statements)]
}

/** The filters of the ways whose shape is kept, for `way.<set><filter>`. */
export function shapeFilters(categories: readonly PlaceCategory[]): string[] {
  const filters = categories.filter((c) => CATEGORY[c].shape).flatMap((c) => CATEGORY[c].selectors.map((s) => s.filter))
  return [...new Set(filters)]
}

export const isShape = (tags: Tags) => categorize(tags).some((c) => CATEGORY[c].shape)
