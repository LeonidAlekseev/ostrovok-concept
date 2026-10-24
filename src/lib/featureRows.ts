import { viewsOfRoomName } from './features'

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
}

export interface ViewRow {
  hotel_id: string
  master_id: number
  rg_hash: string
  view: string
}

/** What `public.hotel_geo(lat, lon)` answers, the parts read here. */
export interface HotelGeo {
  building?: { id?: unknown; height?: unknown; floors?: unknown } | null
  loudest?: Partial<Record<'Lden' | 'Lnight', { source?: unknown; db_min?: unknown; db_max?: unknown }>> | null
}

const positive = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null)
const db = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) ? value : null)
const text = (value: unknown) => (typeof value === 'string' && value ? value : null)

/** The hotel's row, or `null` when `hotel_geo` found neither a building nor noise there (outside Valencia). */
export function featureRow(hotelId: string, geo: HotelGeo): FeatureRow | null {
  const building = geo.building && text(geo.building.id) ? geo.building : null
  const floors = positive(building?.floors)
  const noise = (indicator: 'Lden' | 'Lnight') => {
    const band = geo.loudest?.[indicator]
    const min = db(band?.db_min)
    const max = db(band?.db_max)
    return min === null && max === null ? [null, null, null] : [min, max, text(band?.source)]
  }
  const [lden_min, lden_max, lden_source] = noise('Lden')
  const [lnight_min, lnight_max, lnight_source] = noise('Lnight')
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
  name_struct?: { main_name?: unknown } | null
}

/** A row a view a room group's name tells of; a group named twice counts once. */
export function viewRows(masterId: number, groups: readonly RoomGroup[]): ViewRow[] {
  const rows = new Map<string, ViewRow>()
  for (const group of groups) {
    const hash = text(group.rg_hash)
    const name = text(group.name_struct?.main_name)
    if (!hash || !name) continue
    for (const view of viewsOfRoomName(name))
      rows.set(`${hash}:${view}`, { hotel_id: `ota-${masterId}`, master_id: masterId, rg_hash: hash, view })
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
  // `real` columns come back rounded to float4.
  const close = (a: unknown, b: unknown) =>
    a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-4)
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
