import { bandLabel, type NoiseBand } from './features'
import { countRu } from './format'
import { distanceLabel } from './hotelDetails'

/**
 * «Шум и окружение» of a real hotel, the same for its page and for Эвал: the bands of the EEA strategic noise maps
 * (END, round 2022) the hotel's point lies in, by source, and the loud places of OpenStreetMap around it. A band is
 * what EEA gives — a 5 dB range, not a level — and EEA states no method or error for it: none is made up. A hotel
 * outside every contour has no EEA data (the maps stop below their lowest band), which is not «тихо».
 */

export type NoiseIndicator = 'Lden' | 'Lnight'

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

/** The OSM categories of loud places nearby: the nightlife, the food and the rails. */
export const NOISY_CATEGORIES = ['nightclub', 'bar', 'restaurant', 'fast_food', 'tram', 'train_station'] as const
export type NoisyCategory = (typeof NOISY_CATEGORIES)[number]

export const NOISY_LABEL: Record<NoisyCategory, [string, string, string]> = {
  nightclub: ['ночной клуб', 'ночных клуба', 'ночных клубов'],
  bar: ['бар', 'бара', 'баров'],
  restaurant: ['ресторан', 'ресторана', 'ресторанов'],
  fast_food: ['фастфуд', 'фастфуда', 'фастфудов'],
  tram: ['остановка трамвая', 'остановки трамвая', 'остановок трамвая'],
  train_station: ['ж/д станция', 'ж/д станции', 'ж/д станций'],
}

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

export interface HotelNoise {
  /** The layers whose contours cover the hotel's point; empty: no EEA data at the point. */
  sources: SourceNoise[]
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

/** The day level's range, dB, from the bands of one layer. */
export interface DayEstimate {
  min: number
  max: number
}

/**
 * The day level of `dayLevel` over the whole bands: the loudest day of the loudest Lden with the quietest night, the
 * quietest day of the quietest Lden with the loudest night. A pair the formula cannot fit at the quiet end keeps the
 * night's lower bound, assuming the day no quieter than the night. `null` without an Lden closed on both ends, a
 * closed night band or a fit at all.
 */
export function dayEstimate(lden: NoiseBand | undefined, lnight: NoiseBand | undefined): DayEstimate | null {
  if (lden?.min === undefined || lden.max === undefined || lnight?.min === undefined || lnight.max === undefined)
    return null
  const max = dayLevel(upperOf(lden), lnight.min)
  if (max === null) return null
  const min = Math.max(dayLevel(lden.min, upperOf(lnight)) ?? lnight.min, lnight.min)
  return min > max ? null : { min, max }
}

/** «58–63 дБ». */
export const dayLabel = ({ min, max }: DayEstimate) =>
  Math.round(min) === Math.round(max) ? `≈${Math.round(min)} дБ` : `${Math.round(min)}–${Math.round(max)} дБ`

/** Day 07–19, evening 19–23, night 23–07 (the directive's default periods, Spain's as well). */
export const DAY_START = 7
export const NIGHT_START = 23
/** A change of level is spread over this many hours around 07:00 and 23:00. */
const RAMP_HOURS = 2

const smoothstep = (t: number) => t * t * (3 - 2 * t)

/** The level at `hour` (0–24) of a day with these day and night levels, the changes smoothed. */
export function levelAt(hour: number, day: number, night: number): number {
  const half = RAMP_HOURS / 2
  const ramp = (from: number, to: number, start: number) =>
    from + (to - from) * smoothstep(Math.min(1, Math.max(0, (hour - start) / RAMP_HOURS)))
  if (hour < NIGHT_START - half) return ramp(night, day, DAY_START - half)
  return ramp(day, night, NIGHT_START - half)
}

export interface DayCurve {
  /** The levels of the half-hours from 00:00, dB. */
  levels: number[]
  day: number
  night: number
}

/**
 * The 24 hours of the layer with the loudest Lden: the night band's middle at night; by day and in the evening the day
 * level of the bands' middles (`dayLevel`), kept within the day estimate, or the estimate's middle when the middles do
 * not fit; smoothed around 07:00 and 23:00. An illustration of the two bands, not a measurement: `null` when the bands
 * are open or do not fit.
 */
export function dayCurve(noise: Pick<HotelNoise, 'sources'>): DayCurve | null {
  const source = loudestSource(noise, 'Lden')
  const estimate = source && dayEstimate(source.lden, source.lnight)
  if (!estimate) return null
  const night = (lowerOf(source.lnight!) + upperOf(source.lnight!)) / 2
  const middle = dayLevel((lowerOf(source.lden!) + upperOf(source.lden!)) / 2, night)
  const day =
    middle === null ? (estimate.min + estimate.max) / 2 : Math.min(estimate.max, Math.max(estimate.min, middle))
  return { day, night, levels: Array.from({ length: 48 }, (_, i) => levelAt(i / 2 + 0.25, day, night)) }
}

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
  'Нет данных EEA: точка отеля вне загруженных карт шума (у нас карты города Валенсия) или ниже порога картирования'
export const CURVE_NOTE = 'Точность и монотонность не гарантируются.'

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

/**
 * The facts of the noise for the page's summary and for Эвал, one line each: the loudest bands, the day estimate,
 * each layer and the loud places nearby. Only the data: no level is stated without its band.
 */
export function noiseLines(noise: HotelNoise | null | undefined): string[] {
  if (!noise) return []
  const lines: string[] = []
  const lden = loudestSource(noise, 'Lden')
  const lnight = loudestSource(noise, 'Lnight')
  if (!hasEeaNoise(noise)) lines.push(`${NO_EEA}.`)
  if (lden) {
    const who = whoLine(lden, 'Lden')
    lines.push(
      `За сутки (Lden) по карте шума EEA 2022: ${bandLabel(lden.lden!)}, громче всего — ${noiseSourceLabel(lden.source).toLocaleLowerCase('ru')}${who ? `; ${who}` : ''}.`,
    )
  }
  if (lnight) {
    const who = whoLine(lnight, 'Lnight')
    lines.push(
      `Ночью (Lnight, 23:00–07:00): ${bandLabel(lnight.lnight!)}, громче всего — ${noiseSourceLabel(lnight.source).toLocaleLowerCase('ru')}${who ? `; ${who}` : ''}.`,
    )
  }
  const day = lden && dayEstimate(lden.lden, lden.lnight)
  if (day)
    lines.push(`Днём, по оценке из Lden и Lnight (директива ЕС 2002/49/EC, вечер принят равным дню): ${dayLabel(day)}.`)
  if (noise.sources.length > 1)
    lines.push(
      `Источники EEA у отеля: ${noise.sources
        .map((s) =>
          [
            noiseSourceLabel(s.source),
            s.lden && `${bandLabel(s.lden)} за сутки`,
            s.lnight && `${bandLabel(s.lnight)} ночью`,
          ]
            .filter(Boolean)
            .join(' '),
        )
        .join('; ')}.`,
    )
  const places = placeLines(noise)
  if (places.length) lines.push(`Шумные места OpenStreetMap в ${NOISY_RADIUS_M} м: ${places.join('; ')}.`)
  else if (noise.placesCovered.length === NOISY_CATEGORIES.length)
    lines.push(`Баров, клубов, ресторанов и трамвайных остановок в ${NOISY_RADIUS_M} м по OpenStreetMap нет.`)
  return lines
}
