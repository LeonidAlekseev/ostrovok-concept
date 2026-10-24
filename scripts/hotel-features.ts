// Derives the hotels' features for Эвал: the building and the noise at each real hotel (`public.hotel_geo`) into
// `hotel_features`, the views of its room types (the names of `ota_hotels.static_vm.room_groups`) into
// `hotel_room_views`. Copies no raw data: only the derived values and the reference to the source.
//   npm run db:features [-- --dry-run]   (Node runs the TypeScript itself; the keys come from .env.local)
// `--dry-run` reads and counts, and writes nothing.
// Idempotent: writes only the new and changed rows and deletes the stale ones, so a second run over the same data
// changes nothing. Only the real hotels (`ota-<master_id>`) are read; nothing is made up for the others. Needs
// NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; prints counts, never the keys. Afterwards: npm run db:embed.
import { registerHooks } from 'node:module'
import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'

// The app's modules import each other without extensions, as the bundler allows; Node needs `.ts`.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  },
})

const { diffRows, featureRow, viewRows } = await import('../src/lib/featureRows.ts')
type FeatureRow = import('../src/lib/featureRows.ts').FeatureRow
type ViewRow = import('../src/lib/featureRows.ts').ViewRow
type HotelGeo = import('../src/lib/featureRows.ts').HotelGeo
type RoomGroup = import('../src/lib/featureRows.ts').RoomGroup

const { values: options } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false } } })
const dryRun = options['dry-run']

const PAGE = 1000
const BATCH = 200
/** `hotel_geo` calls at a time. */
const PARALLEL = 8

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set: run npm run secrets:reveal`)
  return value
}

const supabase = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function readAll<T>(table: string, columns: string, orderBy: string[], filter?: (q: any) => any): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    let query = orderBy.reduce((q, column) => q.order(column), supabase.from(table).select(columns))
    if (filter) query = filter(query)
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data as T[]))
    if (data.length < PAGE) return rows
  }
}

async function write<T extends object>(table: string, keys: (keyof T & string)[], current: T[], next: T[]) {
  const key = (row: T) => keys.map((k) => String(row[k])).join(':')
  const { upsert, remove } = diffRows(current, next, key)
  if (dryRun)
    return console.log(`${table}: ${next.length} rows, would write ${upsert.length} and delete ${remove.length}`)
  const updatedAt = new Date().toISOString()
  for (let i = 0; i < upsert.length; i += BATCH) {
    const rows = upsert.slice(i, i + BATCH).map((row) => ({ ...row, updated_at: updatedAt }))
    const { error } = await supabase.from(table).upsert(rows, { onConflict: keys.join(',') })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
  for (const row of remove) {
    const match = Object.fromEntries(keys.map((k) => [k, row[k]]))
    const { error } = await supabase.from(table).delete().match(match)
    if (error) throw new Error(`${table}: ${error.message}`)
  }
  console.log(`${table}: ${next.length} rows, ${upsert.length} written, ${remove.length} deleted`)
}

const hotels = await readAll<{ id: string; lat: number; lon: number }>('hotels', 'id, lat, lon', ['id'], (q) =>
  q.like('id', 'ota-%'),
)

// The building and the noise of each hotel.
const features: FeatureRow[] = []
for (let i = 0; i < hotels.length; i += PARALLEL) {
  const rows = await Promise.all(
    hotels.slice(i, i + PARALLEL).map(async (hotel) => {
      const { data, error } = await supabase.rpc('hotel_geo', { lat: hotel.lat, lon: hotel.lon })
      if (error) throw new Error(`hotel_geo: ${error.message}`)
      return featureRow(hotel.id, (data ?? {}) as HotelGeo)
    }),
  )
  features.push(...rows.filter((row) => row !== null))
}

// The views of the room types of the hotels in the catalogue.
const inCatalogue = new Set(hotels.map((h) => h.id))
const raw = await readAll<{ master_id: number; room_groups: RoomGroup[] | null }>(
  'ota_hotels',
  'master_id, room_groups:static_vm->room_groups',
  ['master_id'],
)
const views: ViewRow[] = raw
  .filter((h) => inCatalogue.has(`ota-${h.master_id}`))
  .flatMap((h) => viewRows(h.master_id, h.room_groups ?? []))

/** The rows already there; a dry run before the migration (no table yet) sees none. */
async function stored<T>(table: string, columns: string, orderBy: string[]): Promise<T[]> {
  try {
    return await readAll<T>(table, columns, orderBy)
  } catch (error) {
    if (dryRun && /schema cache|does not exist/.test(String(error))) return []
    throw error
  }
}

const FEATURE_COLUMNS =
  'hotel_id, building_id, height_m, floors, lden_min, lden_max, lden_source, lnight_min, lnight_max, lnight_source'
await write<FeatureRow>(
  'hotel_features',
  ['hotel_id'],
  await stored<FeatureRow>('hotel_features', FEATURE_COLUMNS, ['hotel_id']),
  features,
)
await write<ViewRow>(
  'hotel_room_views',
  ['hotel_id', 'rg_hash', 'view'],
  await stored<ViewRow>('hotel_room_views', 'hotel_id, master_id, rg_hash, view', ['hotel_id', 'rg_hash', 'view']),
  views,
)

const count = (rows: FeatureRow[], pick: (row: FeatureRow) => unknown) => rows.filter((r) => pick(r) !== null).length
console.log(
  `hotels: ${hotels.length} real; with floors ${count(features, (r) => r.floors)}, with night noise ${count(features, (r) => r.lnight_max ?? r.lnight_min)}; ` +
    `with a view ${new Set(views.map((v) => v.hotel_id)).size} (${new Set(views.map((v) => `${v.hotel_id}:${v.rg_hash}`)).size} room types)`,
)
