import { viewsOfRoomName } from './features'
import { NOISE_ESTIMATE_METHOD, loudestSource, type HotelNoise, type LevelRange, type NoiseEstimate } from './noise'

/**
 * The rows `npm run db:features` writes (scripts/hotel-features.ts): pure, so the tests check what goes to the
 * database. Only the derived values and the reference to the source: the building's id, the noise band's source,
 * the room group's `rg_hash`.
 */

export interface FeatureRow {
  hotel_id: string
  building_id: string | null
  height_m: number | null
  floors: number | null
  lden_min: number | null
  lden_max: number | null
  lden_source: string | null
  lnight_min: number | null
  lnight_max: number | null
  lnight_source: string | null
  /** The provenance (`geo_datasets.id`, EUBUCCO's sources and confidence bounds), null where the dataset has none. */
  building_dataset: string | null
  geometry_source: string | null
  height_source: string | null
  height_lower_m: number | null
  height_upper_m: number | null
  floors_source: string | null
  floors_lower: number | null
  floors_upper: number | null
  noise_dataset: string | null
  /** noise-estimate-v1 at the facade (`noiseEstimate`): the street side and the yard side, the places summed in, dB. */
  noise_method: string | null
  noise_zone: 'building' | 'circle' | null
  street_lday_min: number | null
  street_lday_max: number | null
  street_lnight_min: number | null
  street_lnight_max: number | null
  yard_lday_min: number | null
  yard_lday_max: number | null
  yard_lnight_min: number | null
  yard_lnight_max: number | null
}

/** The facade of a hotel for its row: its EEA layers to the street, their dataset and the estimate. */
export interface FacadeNoise {
  sources: HotelNoise['sources']
  dataset: string | null
  estimate: NoiseEstimate | null
}

export interface ViewRow {
  hotel_id: string
  master_id: number
  rg_hash: string
  view: string
}

/** What `public.hotel_geo(lat, lon)` answers, the parts read here. */
export interface HotelGeo {
  building?: {
    id?: unknown
    height?: unknown
    floors?: unknown
    dataset?: unknown
    geometry_source?: unknown
    height_source?: unknown
    height_confidence_lower?: unknown
    height_confidence_upper?: unknown
    floors_source?: unknown
    floors_confidence_lower?: unknown
    floors_confidence_upper?: unknown
  } | null
}

const positive = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null)
const db = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) ? value : null)
const text = (value: unknown) => (typeof value === 'string' && value ? value : null)
/** A bound of an estimate: a floor's lower bound may be 0. */
const bound = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null)

/** A bound of the estimate, to 0.1 dB; an infinite one is an open end. */
const level = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) ? Math.round(value * 10) / 10 : null
const bounds = (range: LevelRange | null | undefined) => [level(range?.min), level(range?.max)] as const

/**
 * The hotel's row, or `null` when `hotel_geo` found no building and the facade no noise (outside Valencia): the
 * building at the point, the loudest EEA band of each indicator at the facade to the street over the layers, and the
 * estimate of noise-estimate-v1 at the facade.
 */
export function featureRow(hotelId: string, geo: HotelGeo, facade: FacadeNoise): FeatureRow | null {
  const building = geo.building && text(geo.building.id) ? geo.building : null
  const floors = positive(building?.floors)
  const noise = (indicator: 'Lden' | 'Lnight') => {
    const source = loudestSource(facade, indicator)
    const band = indicator === 'Lden' ? source?.lden : source?.lnight
    const min = db(band?.min)
    const max = db(band?.max)
    return min === null && max === null ? [null, null, null] : [min, max, source!.source]
  }
  const [lden_min, lden_max, lden_source] = noise('Lden')
  const [lnight_min, lnight_max, lnight_source] = noise('Lnight')
  const noiseDataset = lden_source || lnight_source ? facade.dataset : null
  const estimate = facade.estimate
  const [street_lday_min, street_lday_max] = bounds(estimate?.street.lday)
  const [street_lnight_min, street_lnight_max] = bounds(estimate?.street.lnight)
  const [yard_lday_min, yard_lday_max] = bounds(estimate?.yard.lday)
  const [yard_lnight_min, yard_lnight_max] = bounds(estimate?.yard.lnight)
  const row: FeatureRow = {
    hotel_id: hotelId,
    building_id: building ? text(building.id) : null,
    height_m: building ? positive(building.height) : null,
    // The dataset estimates the floors (7.4); a building has at least one.
    floors: floors === null ? null : Math.max(1, Math.round(floors)),
    lden_min: lden_min as number | null,
    lden_max: lden_max as number | null,
    lden_source: lden_source as string | null,
    lnight_min: lnight_min as number | null,
    lnight_max: lnight_max as number | null,
    lnight_source: lnight_source as string | null,
    building_dataset: building ? text(building.dataset) : null,
    geometry_source: building ? text(building.geometry_source) : null,
    height_source: building ? text(building.height_source) : null,
    height_lower_m: building ? bound(building.height_confidence_lower) : null,
    height_upper_m: building ? bound(building.height_confidence_upper) : null,
    floors_source: building ? text(building.floors_source) : null,
    floors_lower: building ? bound(building.floors_confidence_lower) : null,
    floors_upper: building ? bound(building.floors_confidence_upper) : null,
    noise_dataset: noiseDataset,
    noise_method: estimate ? NOISE_ESTIMATE_METHOD : null,
    noise_zone: estimate?.zone?.kind ?? null,
    street_lday_min,
    street_lday_max,
    street_lnight_min,
    street_lnight_max,
    yard_lday_min,
    yard_lday_max,
    yard_lnight_min,
    yard_lnight_max,
  }
  return row.building_id ||
    row.lden_max !== null ||
    row.lden_min !== null ||
    row.lnight_max !== null ||
    row.lnight_min !== null
    ? row
    : null
}

/** The room groups of an Ostrovok hotel (`static_vm.room_groups`), the parts read here. */
export interface RoomGroup {
  rg_hash?: unknown
  /** The class of the room type: the same for the variants of one room (views, beds) among the suppliers. */
  room_group_id?: unknown
  name_struct?: { main_name?: unknown } | null
}

/**
 * A row a view a room group's name tells of, one per `room_group_id`: the directory holds many names of one room
 * (182 records, 99 ids at a hotel), and the first record of the id carries the row's `rg_hash`. A group without an id
 * counts by its `rg_hash`.
 */
export function viewRows(masterId: number, groups: readonly RoomGroup[]): ViewRow[] {
  const rows = new Map<string, ViewRow>()
  for (const group of groups) {
    const hash = text(group.rg_hash)
    const name = text(group.name_struct?.main_name)
    if (!hash || !name) continue
    const id = typeof group.room_group_id === 'number' ? `id${group.room_group_id}` : `hash${hash}`
    for (const view of viewsOfRoomName(name)) {
      const key = `${id}:${view}`
      if (!rows.has(key)) rows.set(key, { hotel_id: `ota-${masterId}`, master_id: masterId, rg_hash: hash, view })
    }
  }
  return [...rows.values()]
}

/**
 * What to write so the table holds exactly `next`: the new and changed rows to upsert and the keys of the rows to
 * delete. A second run over the same data gives nothing to do.
 */
export function diffRows<T extends object>(
  current: readonly T[],
  next: readonly T[],
  key: (row: T) => string,
): { upsert: T[]; remove: T[] } {
  // `real` columns come back rounded to float4; `jsonb` ones come back with their keys in another order.
  const close = (a: unknown, b: unknown): boolean => {
    if (a === b) return true
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-4
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
    if (Array.isArray(a) || Array.isArray(b))
      return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => close(v, b[i]))
    const [x, y] = [a, b] as Record<string, unknown>[]
    const keys = Object.keys(y)
    return Object.keys(x).length === keys.length && keys.every((k) => k in x && close(x[k], y[k]))
  }
  const same = (a: T, b: T) => (Object.keys(b) as (keyof T)[]).every((k) => close(a[k], b[k]))
  const before = new Map(current.map((row) => [key(row), row]))
  const after = new Set(next.map(key))
  return {
    upsert: next.filter((row) => {
      const old = before.get(key(row))
      return !old || !same(old, row)
    }),
    remove: current.filter((row) => !after.has(key(row))),
  }
}
