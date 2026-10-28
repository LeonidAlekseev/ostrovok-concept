import { bandLabel, type NoiseBand } from './features'
import { isGeoQuestion } from './geo/questions'
import { countRu } from './format'
import { distanceLabel } from './hotelDetails'
import { isViewQuestion } from './view'

/**
 * «Шум и окружение» of a real hotel, the same for its page and for Эвал: the bands of the EEA strategic noise maps
 * (END, round 2022) at the hotel's facade, by source, the loud places of OpenStreetMap around it, and the estimate of
 * both at the facade (`noiseEstimate`, noise-estimate-v2). A band is what EEA gives — a 5 dB range, not a level — and
 * the estimate keeps the range. A hotel outside every contour has no EEA data (the maps stop below their lowest band),
 * which is not «тихо».
 */

export type NoiseIndicator = 'Lden' | 'Lnight'

/**
 * The modes of the noise map: the day level estimated from Lden and Lnight (`dayEstimate`) and EEA's Lnight. Lden, a
 * weighted mean of the 24 hours, is no level of the day and is not drawn.
 */
export type NoiseMapIndicator = 'Lday' | 'Lnight'
export const NOISE_MAP_LABEL: Record<NoiseMapIndicator, string> = { Lday: 'Днём', Lnight: 'Ночью' }

/** A question about the noise: «шумно», «тихо», «громко», «децибелы» — not «стихи». */
export const isNoiseQuestion = (text: string) => /(?<!\p{L})(?:бес|не)?(?:шум|тих|громк|децибел)/iu.test(text)

/**
 * A question of the hotel's chat for the geo calls (src/lib/ai/geoTurn.ts): about the places near the hotel or the way
 * to one, and not about the noise or the view — «Шумно ли рядом?» is answered from the noise data, «Есть ли бар рядом?» by the calls.
 */
export const isHotelGeoQuestion = (text: string) =>
  !isNoiseQuestion(text) && !isViewQuestion(text) && isGeoQuestion(text)

/**
 * A question of the hotel's chat about the view from its windows (src/lib/ai/viewTurn.ts): «Видно ли море из окна?»,
 * «Будет ли виден закат?» — and not about the noise: «Шумно ли из окна?» is the noise data's.
 */
export const isHotelViewQuestion = (text: string) => !isNoiseQuestion(text) && isViewQuestion(text)

/** EEA's noise contours of the round 2022 (`geo_datasets.url` of `eea-noise-end2022-v01_r00`). */
export const EEA_NOISE_URL =
  'https://sdi.eea.europa.eu/datastore/public?path=/eea_v_3035_1_k_noise-contours-end2022_p_2026_v01_r00'

/** The layers of EEA's noise contours, as EEA names them. */
export const NOISE_SOURCE_LABEL: Readonly<Record<string, string>> = {
  roadsInAgglomeration: 'Дороги города',
  majorRoadsIncludingAgglomeration: 'Магистрали',
  railwaysInAgglomeration: 'Железная дорога в городе',
  majorRailwaysIncludingAgglomeration: 'Магистральная железная дорога',
  industryInAgglomeration: 'Промышленность',
  majorAirportsIncludingAgglomeration: 'Аэропорт',
}

export const noiseSourceLabel = (source: string) => NOISE_SOURCE_LABEL[source] ?? source

/**
 * The levels the WHO Environmental Noise Guidelines for the European Region (2018) recommend not to exceed, by EEA's
 * layer; the guidelines give none for industry.
 */
const WHO_LIMIT: Readonly<Record<string, { lden: number; lnight: number }>> = {
  roadsInAgglomeration: { lden: 53, lnight: 45 },
  majorRoadsIncludingAgglomeration: { lden: 53, lnight: 45 },
  railwaysInAgglomeration: { lden: 54, lnight: 44 },
  majorRailwaysIncludingAgglomeration: { lden: 54, lnight: 44 },
  majorAirportsIncludingAgglomeration: { lden: 45, lnight: 40 },
}

/** The bands of one EEA layer at the hotel's point. */
export interface SourceNoise {
  source: string
  lden?: NoiseBand
  lnight?: NoiseBand
}

/**
 * The OSM categories of loud places nearby: the nightlife, the food and the rails, the loudest at night first (a place
 * of several categories is listed under the first: a bar that serves food is a bar).
 */
export const NOISY_CATEGORIES = [
  'nightclub',
  'bar',
  'restaurant',
  'cafe',
  'fast_food',
  'tram',
  'train_station',
] as const
export type NoisyCategory = (typeof NOISY_CATEGORIES)[number]

export const NOISY_LABEL: Record<NoisyCategory, [string, string, string]> = {
  nightclub: ['ночной клуб', 'ночных клуба', 'ночных клубов'],
  bar: ['бар', 'бара', 'баров'],
  restaurant: ['ресторан', 'ресторана', 'ресторанов'],
  cafe: ['кафе', 'кафе', 'кафе'],
  fast_food: ['фастфуд', 'фастфуда', 'фастфудов'],
  tram: ['остановка трамвая', 'остановки трамвая', 'остановок трамвая'],
  train_station: ['ж/д станция', 'ж/д станции', 'ж/д станций'],
}

/** The dots of the loud places on the map and in its legend, by group: the nightlife, the food and the rails. */
export const NOISY_GROUPS: readonly { label: string; color: string; categories: readonly NoisyCategory[] }[] = [
  { label: 'Бары и клубы', color: '#7c3aed', categories: ['nightclub', 'bar'] },
  { label: 'Рестораны, кафе, фастфуд', color: '#ea580c', categories: ['restaurant', 'cafe', 'fast_food'] },
  { label: 'Трамвай и ж/д', color: '#2563eb', categories: ['tram', 'train_station'] },
]

/** The place of a category in `NOISY_CATEGORIES`: of a place's several categories the first counts. */
export const noisyRank = (category: string) => NOISY_CATEGORIES.indexOf(category as NoisyCategory)

/** The group of a loud place's category. */
export const noisyGroup = (category: NoisyCategory) => NOISY_GROUPS.find((g) => g.categories.includes(category))!

/** The circle of the loud places, m, and the places a category at most. */
export const NOISY_RADIUS_M = 200
export const NOISY_PER_CATEGORY = 20

export interface NoisyPlace {
  category: NoisyCategory
  name: string | null
  distanceM: number
  lat: number
  lon: number
}

/**
 * Where the facade is read (`hotel_noise_facade`): the contour of the hotel's building of EUBUCCO widened by
 * `FACADE_BUFFER_M`, or a circle of `FACADE_CIRCLE_M` around the point without a building.
 */
export type FacadeZone = { kind: 'building'; buildingId: string; bufferM: number } | { kind: 'circle'; radiusM: number }

export interface HotelNoise {
  /**
   * The facade to the street: per EEA layer the loudest band crossing the facade's zone, the louder layer first; empty:
   * no EEA data there. EEA's maps leave the buildings out, so the hotel's own point is not read.
   */
  sources: SourceNoise[]
  /** The windows to the yard: per layer the quietest band in the same zone. */
  yard: SourceNoise[]
  /** `null`: the facade could not be read (outside the coordinates' range). */
  zone: FacadeZone | null
  /** Nearest first, within `NOISY_RADIUS_M`. */
  places: NoisyPlace[]
  /** The categories the OSM cache has loaded around the hotel: a category not here is unknown, not absent. */
  placesCovered: NoisyCategory[]
}

/** The real range of a band, dB: `55–59` is [55, 60); an open end is infinite. */
const lowerOf = (band: NoiseBand) => band.min ?? -Infinity
const upperOf = (band: NoiseBand) => (band.max === undefined ? Infinity : band.max + 1)

/** A louder band first: by the lower bound, an open top above all. */
const minus = (x: number, y: number) => (x === y ? 0 : x - y)
const louder = (a: NoiseBand, b: NoiseBand) => minus(lowerOf(b), lowerOf(a)) || minus(upperOf(b), upperOf(a))

/** The louder layer first: by its Lden band, then by its Lnight band; a missing band is the quietest. */
export function louderSource(a: SourceNoise, b: SourceNoise): number {
  const none: NoiseBand = { max: -Infinity }
  return louder(a.lden ?? none, b.lden ?? none) || louder(a.lnight ?? none, b.lnight ?? none)
}

/** The source of the loudest band of the indicator at the point, with its band. */
export function loudestSource(noise: Pick<HotelNoise, 'sources'>, indicator: NoiseIndicator): SourceNoise | undefined {
  const key = indicator === 'Lden' ? 'lden' : 'lnight'
  return noise.sources.filter((s) => s[key]).sort((a, b) => louder(a[key]!, b[key]!))[0]
}

export const hasEeaNoise = (noise: Pick<HotelNoise, 'sources'> | null | undefined) =>
  Boolean(noise && noise.sources.length > 0)

/**
 * The day level of the EU directive 2002/49/EC (Annex I) from Lden and Lnight, assuming the evening as loud as the day:
 * Lden = 10·lg(1/24·(12·10^(Lday/10) + 4·10^((Levening+5)/10) + 8·10^((Lnight+10)/10))) with Levening = Lday gives
 * Lday = 10·lg((24·10^(Lden/10) − 8·10^((Lnight+10)/10)) / (12 + 4·10^0.5)). `null` when no day level fits the pair.
 */
export function dayLevel(lden: number, lnight: number): number | null {
  const rest = 24 * 10 ** (lden / 10) - 8 * 10 ** ((lnight + 10) / 10)
  return rest > 0 ? 10 * Math.log10(rest / (12 + 4 * Math.sqrt(10))) : null
}

/**
 * The day level's range, dB, from the bands of one layer: `max` infinite for an Lden open at the top, `min` for an Lden
 * open below («ниже 40 дБ») with a night open below.
 */
export interface DayEstimate {
  min: number
  max: number
}

/** Lden − Lday when the evening and the night are as loud as the day: 10·lg((12 + 4·10^0.5 + 8·10)/24). */
const EVEN_DAY = 10 * Math.log10((12 + 4 * Math.sqrt(10) + 80) / 24)

/**
 * The day level of `dayLevel` over the whole bands, assuming as well the day no quieter than the night: the loudest
 * day is the one of the loudest Lden with the quietest night, the quietest day the one of the quietest Lden with the
 * loudest night that is not louder than the day. A band open below (EEA's «below 40 dB») leaves its level unbounded
 * below, an Lden open at the top the day unbounded above. `null` without both bands or when the pair fits no day (the
 * bands of the two maps do not quite meet at their borders).
 */
export function dayEstimate(lden: NoiseBand | undefined, lnight: NoiseBand | undefined): DayEstimate | null {
  if (!lden || !lnight) return null
  const max = lden.max === undefined ? Infinity : dayLevel(upperOf(lden), lowerOf(lnight))
  if (max === null) return null
  const low = lowerOf(lden)
  const min = Math.max(dayLevel(low, upperOf(lnight)) ?? -Infinity, low - EVEN_DAY, lowerOf(lnight))
  return min > max ? null : { min, max }
}

/** «58–63 дБ»; «от 69 дБ» and «ниже 40 дБ» for an open estimate. */
export function dayLabel({ min, max }: DayEstimate): string {
  if (max === Infinity) return `от ${Math.round(min)} дБ`
  if (min === -Infinity) return `ниже ${Math.round(max)} дБ`
  return Math.round(min) === Math.round(max) ? `≈${Math.round(min)} дБ` : `${Math.round(min)}–${Math.round(max)} дБ`
}

/** The level a day estimate is coloured by on the map: its middle, or its closed bound when it is open. */
export const dayColorLevel = ({ min, max }: DayEstimate) =>
  max === Infinity ? min : min === -Infinity ? max : (min + max) / 2

/** The radius of the noise map, m: the streets around the hotel at ~100 KB a night layer. */
export const NOISE_MAP_RADIUS_M = 300

/**
 * The `source` of the map's quiet: where the EEA layers map the ground and none reaches 40 dB (`hotel_noise_quiet`).
 */
export const QUIET_SOURCE = 'quiet'

/** The bands of the legend and the map, quiet to loud: their lower bounds, the first open below. */
export const LEGEND_STEPS = [40, 45, 50, 55, 60, 65, 70, 75] as const
/** ColorBrewer RdYlGn, quiet green to loud red: one colour below 40 and one a step. */
export const NOISE_COLORS = [
  '#1a9850',
  '#66bd63',
  '#a6d96a',
  '#d9ef8b',
  '#fee08b',
  '#fdae61',
  '#f46d43',
  '#d73027',
  '#a50026',
] as const

/** The colour of a piece of the day map whose bands fit no day level. */
export const NOISE_UNKNOWN_COLOR = '#9ca3af'

/** The colour of a level or of a band's lower bound. */
export const noiseColor = (db: number) => NOISE_COLORS[LEGEND_STEPS.filter((step) => db >= step).length]

/** How the band stands to the WHO recommendation for its layer; `null` without one. */
export function whoVerdict(source: SourceNoise, indicator: NoiseIndicator): 'below' | 'above' | 'around' | null {
  const limit = WHO_LIMIT[source.source]
  const band = indicator === 'Lden' ? source.lden : source.lnight
  if (!limit || !band) return null
  const value = indicator === 'Lden' ? limit.lden : limit.lnight
  if (upperOf(band) <= value) return 'below'
  if (lowerOf(band) >= value) return 'above'
  return 'around'
}

const WHO_TEXT = {
  below: 'ниже рекомендации ВОЗ',
  above: 'выше рекомендации ВОЗ',
  around: 'на уровне рекомендации ВОЗ',
} as const

/** «выше рекомендации ВОЗ (45 дБ ночью для дорог)». */
export function whoLine(source: SourceNoise, indicator: NoiseIndicator): string | null {
  const verdict = whoVerdict(source, indicator)
  if (!verdict) return null
  const limit = WHO_LIMIT[source.source][indicator === 'Lden' ? 'lden' : 'lnight']
  return `${WHO_TEXT[verdict]} (${limit} дБ ${indicator === 'Lden' ? 'за сутки' : 'ночью'})`
}

export const NO_EEA =
  'Нет данных EEA: здание отеля вне загруженных карт шума (у нас карты города Валенсия) или ниже порога картирования'

/** «5 баров, ближайшее место «Homenaje» — 90 м» by category, the nearest category first. */
export function placeLines(noise: Pick<HotelNoise, 'places'>): string[] {
  const groups = new Map<NoisyCategory, NoisyPlace[]>()
  for (const place of noise.places) groups.set(place.category, [...(groups.get(place.category) ?? []), place])
  return [...groups].map(([category, places]) => {
    const nearest = places[0]
    const count = countRu(places.length, NOISY_LABEL[category])
    return `${count}${places.length >= NOISY_PER_CATEGORY ? ' и больше' : ''}, ближайшее место${nearest.name ? ` «${nearest.name}»` : ''} — ${distanceLabel(nearest.distanceM)}`
  })
}

/** «днём 64–75 дБ, вечером 64–75 дБ, ночью 65–70 дБ, за сутки Lden 72–76 дБ»: the levels of a side known. */
export function sideLine(side: SideLevels): string {
  return (
    [
      side.lday && `днём ${dayLabel(side.lday)}`,
      side.levening && `вечером ${dayLabel(side.levening)}`,
      side.lnight && `ночью ${dayLabel(side.lnight)}`,
      side.lden && `за сутки (Lden) ${dayLabel(side.lden)}`,
    ]
      .filter(Boolean)
      .join(', ') || 'нет оценки'
  )
}

/** «≈46 дБ»: a level of the places, rounded. */
const venueDb = (level: number) => `≈${Math.round(level)} дБ`

/** «днём ≈46 дБ, вечером ≈49 дБ, ночью ≈43 дБ»: the places' sum by period. */
export function venuesLine(venues: NoiseEstimate['venues']): string {
  return [
    venues.lday !== null && `днём ${venueDb(venues.lday)}`,
    venues.levening !== null && `вечером ${venueDb(venues.levening)}`,
    venues.lnight !== null && `ночью ${venueDb(venues.lnight)}`,
  ]
    .filter(Boolean)
    .join(', ')
}

/**
 * The facts of the noise for the page's summary and for Эвал, one line each: the estimate at the facade to the street
 * and to the yard (noise-estimate-v2), the places' share, the EEA layers at the facade and the loud places nearby.
 * Only the data: no level is stated without its range.
 */
export function noiseLines(noise: HotelNoise | null | undefined): string[] {
  if (!noise) return []
  const lines: string[] = []
  const estimate = noiseEstimate(noise)
  if (!estimate) lines.push(`${NO_EEA}.`)
  else {
    lines.push(
      `Оценка шума у фасада на улицу (${NOISE_ESTIMATE_METHOD}: карты шума EEA 2022 и шумные места OpenStreetMap): ${sideLine(estimate.street)}.`,
      `Окна во двор (самые тихие полосы EEA у здания, без заведений: здание их экранирует): ${sideLine(estimate.yard)}.`,
    )
    if (estimate.counted.length)
      lines.push(
        `Вклад заведений рядом (${countRu(estimate.counted.length, ['место', 'места', 'мест'])} в ${NOISY_RADIUS_M} м): ${venuesLine(estimate.venues)}.`,
      )
    const night = loudestSource(noise, 'Lnight')
    const who = night && whoLine(night, 'Lnight')
    lines.push(
      `Карты шума EEA у фасада на улицу: ${noise.sources
        .map((s) =>
          [
            noiseSourceLabel(s.source),
            s.lden && `${bandLabel(s.lden)} за сутки`,
            s.lnight && `${bandLabel(s.lnight)} ночью`,
          ]
            .filter(Boolean)
            .join(' '),
        )
        .join('; ')}${who ? `; ночью ${who}` : ''}.`,
    )
  }
  const places = placeLines(noise)
  if (places.length) lines.push(`Шумные места OpenStreetMap в ${NOISY_RADIUS_M} м: ${places.join('; ')}.`)
  else if (noise.placesCovered.length === NOISY_CATEGORIES.length)
    lines.push(`Баров, клубов, ресторанов, кафе и трамвайных остановок в ${NOISY_RADIUS_M} м по OpenStreetMap нет.`)
  return lines
}

const integer = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) ? value : undefined)

/**
 * The facade of a `hotel_noise_facade` answer: the layers of each side with their Lden and Lnight bands, the louder
 * layer first (`louderSource`), and the zone. Nothing for an answer it cannot read; a layer's name is EEA's, letters
 * and digits only.
 */
export function facadeOf(answer: unknown): Pick<HotelNoise, 'sources' | 'yard' | 'zone'> {
  const value = answer && typeof answer === 'object' ? (answer as { zone?: unknown; bands?: unknown }) : {}
  const sides = { street: new Map<string, SourceNoise>(), yard: new Map<string, SourceNoise>() }
  for (const row of Array.isArray(value.bands) ? value.bands : []) {
    if (!row || typeof row !== 'object') continue
    const { side, source, indicator, db_min, db_max } = row as Record<string, unknown>
    const min = integer(db_min)
    const max = integer(db_max)
    if (
      (side !== 'street' && side !== 'yard') ||
      typeof source !== 'string' ||
      !/^[A-Za-z0-9]+$/.test(source) ||
      (indicator !== 'Lden' && indicator !== 'Lnight') ||
      (min === undefined && max === undefined)
    )
      continue
    const layer = sides[side].get(source) ?? { source }
    layer[indicator === 'Lden' ? 'lden' : 'lnight'] = {
      ...(min !== undefined && { min }),
      ...(max !== undefined && { max }),
    }
    sides[side].set(source, layer)
  }
  const zone = value.zone && typeof value.zone === 'object' ? (value.zone as Record<string, unknown>) : null
  return {
    sources: [...sides.street.values()].sort(louderSource),
    yard: [...sides.yard.values()].sort(louderSource),
    zone:
      zone?.kind === 'building' && typeof zone.building_id === 'string'
        ? { kind: 'building', buildingId: zone.building_id, bufferM: Number(zone.buffer_m) || FACADE_BUFFER_M }
        : zone?.kind === 'circle'
          ? { kind: 'circle', radiusM: Number(zone.radius_m) || FACADE_CIRCLE_M }
          : null,
  }
}

/**
 * noise-estimate-v2, the noise at the hotel's facade by period (hotel-knowledge, «Оценка шума у фасада»): the EEA layers
 * at the facade summed by energy, for the street side (the loudest bands) and the yard side (the quietest); the loud OSM
 * places within `NOISY_RADIUS_M` of the facade (measured from the building's wall, not from the hotel's point) as point
 * sources added to the street side only: the building screens the yard from them. Lday and Levening from Lden and Lnight
 * of each layer (`dayEstimate`, the directive 2002/49/EC); every level a range from the bands' lower and upper bounds,
 * an open band open in the sum. No windows: the levels are outside, at the wall. (v1 added the places to the yard too
 * and measured from the hotel's point.)
 */
export const NOISE_ESTIMATE_METHOD = 'noise-estimate-v2'
export const FACADE_BUFFER_M = 5
export const FACADE_CIRCLE_M = 25

export type NoisePeriod = 'day' | 'evening' | 'night'
export const NOISE_PERIODS = ['day', 'evening', 'night'] as const satisfies readonly NoisePeriod[]

/**
 * The loud places counted as sources, their level at `VENUE_REFERENCE_M` by period, dB: a typical terrace or open
 * door of the kind, not a measurement of the place; a period without a level is when the kind is usually closed. Pubs
 * are OSM's `bar` category.
 */
export const VENUE_LEVELS = {
  nightclub: { evening: 65, night: 72 },
  bar: { day: 58, evening: 65, night: 62 },
  restaurant: { day: 60, evening: 62 },
  cafe: { day: 60, evening: 62 },
  fast_food: { day: 60, evening: 62 },
} as const satisfies Partial<Record<NoisyCategory, Partial<Record<NoisePeriod, number>>>>
export type VenueCategory = keyof typeof VENUE_LEVELS
export const isVenue = (category: string): category is VenueCategory => Object.hasOwn(VENUE_LEVELS, category)

/** The distance of the reference level, m, and the nearest a place counts at: closer, the point source is no model. */
export const VENUE_REFERENCE_M = 10
export const VENUE_MIN_DISTANCE_M = 3

/** A point source's level at `distanceM`: L = Lref − 20·lg(d/10), d no less than `VENUE_MIN_DISTANCE_M`. */
export const venueLevel = (lref: number, distanceM: number) =>
  lref - 20 * Math.log10(Math.max(distanceM, VENUE_MIN_DISTANCE_M) / VENUE_REFERENCE_M)

/** 10·lg Σ10^(L/10): −∞ (an open lower bound) adds nothing, ∞ (an open upper bound) makes the sum open; none is −∞. */
export function energySum(levels: readonly number[]): number {
  if (levels.includes(Infinity)) return Infinity
  const sum = levels.reduce((total, level) => (level === -Infinity ? total : total + 10 ** (level / 10)), 0)
  return sum > 0 ? 10 * Math.log10(sum) : -Infinity
}

/** Lden of the directive from the day (12 h), evening (4 h, +5 dB) and night (8 h, +10 dB) levels; −∞ is silence. */
export function ldenOf(day: number, evening: number, night: number): number {
  if ([day, evening, night].includes(Infinity)) return Infinity
  const energy = (level: number, penalty: number) => (level === -Infinity ? 0 : 10 ** ((level + penalty) / 10))
  const sum = (12 * energy(day, 0) + 4 * energy(evening, 5) + 8 * energy(night, 10)) / 24
  return sum > 0 ? 10 * Math.log10(sum) : -Infinity
}

/** A level's range, dB: −∞ open below, ∞ open above. */
export type LevelRange = DayEstimate

export interface SideLevels {
  lday: LevelRange | null
  levening: LevelRange | null
  lnight: LevelRange | null
  lden: LevelRange | null
}

/** A loud place counted, with its level at the hotel by period, dB. */
export interface CountedVenue {
  category: VenueCategory
  name: string | null
  distanceM: number
  levels: Partial<Record<NoisePeriod, number>>
}

export interface NoiseEstimate {
  zone: FacadeZone | null
  /** The EEA layers alone, summed: the street side and the yard side. */
  eea: { street: SideLevels; yard: SideLevels }
  /** The places summed by period, dB; `null`: none open then. */
  venues: Record<'lday' | 'levening' | 'lnight' | 'lden', number | null>
  counted: CountedVenue[]
  /** The facade to the street (EEA and the places) and the windows to the yard (EEA alone: the building screens the places). */
  street: SideLevels
  yard: SideLevels
  /** The layers whose bands give no day level (one band, or two that do not fit): left out of the day and evening. */
  noDay: string[]
}

const rangeOf = (band: NoiseBand): LevelRange => ({ min: lowerOf(band), max: upperOf(band) })

const sumRanges = (ranges: readonly LevelRange[]): LevelRange | null =>
  ranges.length === 0 ? null : { min: energySum(ranges.map((r) => r.min)), max: energySum(ranges.map((r) => r.max)) }

/** The EEA layers of one side summed by period, and the layers without a day level. */
function eeaSide(sources: readonly SourceNoise[]): { levels: SideLevels; noDay: string[] } {
  const days = sources.map((s) => ({ source: s.source, day: dayEstimate(s.lden, s.lnight) }))
  const day = sumRanges(days.flatMap((d) => (d.day ? [d.day] : [])))
  return {
    levels: {
      lday: day,
      levening: day,
      lnight: sumRanges(sources.flatMap((s) => (s.lnight ? [rangeOf(s.lnight)] : []))),
      lden: sumRanges(sources.flatMap((s) => (s.lden ? [rangeOf(s.lden)] : []))),
    },
    noDay: days.filter((d) => !d.day).map((d) => d.source),
  }
}

const withVenues = (eea: LevelRange | null, venues: number | null): LevelRange | null =>
  !eea || venues === null ? eea : { min: energySum([eea.min, venues]), max: energySum([eea.max, venues]) }

const addVenues = (side: SideLevels, venues: NoiseEstimate['venues']): SideLevels => ({
  lday: withVenues(side.lday, venues.lday),
  levening: withVenues(side.levening, venues.levening),
  lnight: withVenues(side.lnight, venues.lnight),
  lden: withVenues(side.lden, venues.lden),
})

/**
 * The estimate of noise-estimate-v2 from the facade's bands and the loud places (each once, nearest first, as
 * `HotelNoise.places`); `null` without any EEA band at the facade: the places alone make no level of the street.
 */
export function noiseEstimate(noise: Pick<HotelNoise, 'sources' | 'yard' | 'zone' | 'places'>): NoiseEstimate | null {
  if (noise.sources.length === 0) return null
  const counted: CountedVenue[] = noise.places.flatMap((place) => {
    if (!isVenue(place.category) || place.distanceM > NOISY_RADIUS_M) return []
    const lref: Partial<Record<NoisePeriod, number>> = VENUE_LEVELS[place.category]
    const levels = Object.fromEntries(
      NOISE_PERIODS.flatMap((period) => {
        const level = lref[period]
        return level === undefined ? [] : [[period, venueLevel(level, place.distanceM)]]
      }),
    )
    return [{ category: place.category, name: place.name, distanceM: place.distanceM, levels }]
  })
  const period = (p: NoisePeriod) => {
    const levels = counted.flatMap((v) => (v.levels[p] === undefined ? [] : [v.levels[p]]))
    return levels.length ? energySum(levels) : null
  }
  const [lday, levening, lnight] = NOISE_PERIODS.map(period)
  const venues = {
    lday,
    levening,
    lnight,
    lden: counted.length ? ldenOf(lday ?? -Infinity, levening ?? -Infinity, lnight ?? -Infinity) : null,
  }
  const street = eeaSide(noise.sources)
  const yard = eeaSide(noise.yard.length ? noise.yard : noise.sources)
  return {
    zone: noise.zone,
    eea: { street: street.levels, yard: yard.levels },
    venues,
    counted,
    street: addVenues(street.levels, venues),
    // The building screens the yard from the places on the street.
    yard: yard.levels,
    noDay: street.noDay,
  }
}

/** How noise-estimate-v2 is computed, for the page's «Как мы считаем», Эвал and the API's docs. */
export const NOISE_ESTIMATE_NOTES = [
  `Фасад на улицу — для каждого источника карт шума EEA (дороги, железная дорога, аэропорт, промышленность) самая громкая полоса Lden и Lnight, которая пересекает контур здания отеля, расширенный на ${FACADE_BUFFER_M} м (если здания нет — круг ${FACADE_CIRCLE_M} м вокруг точки отеля). Окна во двор — самая тихая полоса в той же зоне; заведения к ним не прибавляются. Карты EEA не заходят внутрь зданий, поэтому по одной точке отеля шум улицы не виден.`,
  'День (07–19) и вечер (19–23) — из Lden и Lnight каждого источника по формуле директивы ЕС 2002/49/EC (приложение I) при допущениях «вечер так же громок, как день» и «день не тише ночи»; ночь (23–07) — полоса Lnight.',
  `Бары и пабы, ночные клубы, рестораны, кафе и фастфуд OpenStreetMap в ${NOISY_RADIUS_M} м — точечные источники с типовым уровнем на ${VENUE_REFERENCE_M} м (день/вечер/ночь, дБ): рестораны, кафе и фастфуд 60/62/—, бары и пабы 58/65/62, ночные клубы —/65/72 («—» — обычно закрыто). У фасада L = Lref − 20·lg(d/10): чем ближе, тем громче; расстояние d — от фасада (контур здания отеля по EUBUCCO; от точки отеля, если здания нет), не меньше ${VENUE_MIN_DISTANCE_M} м. Заведения прибавляются только к фасаду на улицу.`,
  'Уровни складываются по энергии, 10·lg Σ10^(L/10): сначала заведения, затем с картами EEA. Считаем для нижней и верхней границы полос, поэтому итог — диапазон; открытая полоса «75 дБ и выше» остаётся открытой сверху.',
  'Здание полностью экранирует двор от заведений (их вклад к окнам во двор нулевой), другие здания между заведением и фасадом, окна и звукоизоляцию номеров, часы работы конкретных мест не учитываем; уровни — снаружи у стены. Уверенность по политике confidence-1: полосы у фасада — 0,9, вклад заведений — 0,6.',
] as const
