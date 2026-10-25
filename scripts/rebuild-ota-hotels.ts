// Rebuilds the catalogue rows of the real hotels (`ota-*` in `hotels`) from their raw Ostrovok data in `ota_hotels`,
// with no search JSON: the rooms of the rates only (not the directory `room_groups`), no generated reviews, section scores or guests' photos.
//   npm run db:rebuild:ota -- --dry-run   (reads only: prints what would change)
//   npm run db:rebuild:ota                (writes the changed rows)
// Idempotent: a row whose data is already the rebuilt one is left alone, so a second run writes nothing. Keeps the
// `position` of every row, touches no synthetic hotel and no other table. Needs NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY; prints counts, never the keys. Afterwards: `npm run db:embed`.
import { isDeepStrictEqual, parseArgs } from 'node:util'
import { registerHooks } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/lib/db/database.types.ts'

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

const { REAL_HOTEL_ID_PREFIX } = await import('../src/lib/catalog.ts')
const { otaHotel, searchStay } = await import('../src/lib/ota/hotel.ts')
const { otaHotelSchema, otaMapHotelSchema } = await import('../src/lib/ota/search.ts')

const DESTINATION_ID = 'valencia'
// Rows of jsonb a request: small enough for the database's short statement timeout.
const BATCH = 50
/** A table of the schema, for the helpers that take its name. */
type Table = keyof Database['public']['Tables']

const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false } } })
const dryRun = values['dry-run']

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set: run npm run secrets:reveal`)
  return value
}

const supabase = createClient<Database>(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Every row of a table, a page at a time, in the order of `key`. */
async function readAll<Row>(table: Table, columns: string, key: string): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(key)
      .range(from, from + BATCH - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data as unknown as Row[]))
    if (data.length < BATCH) return rows
  }
}

interface OtaRow {
  master_id: number
  ota_hotel_id: string
  static_vm: unknown
  rates: unknown
  map_hotel: unknown
}
interface HotelRow {
  id: string
  position: number
  data: unknown
}

const otaRows = await readAll<OtaRow>('ota_hotels', 'master_id,ota_hotel_id,static_vm,rates,map_hotel', 'master_id')
const raws = otaRows.map((row) =>
  otaHotelSchema.parse({
    master_id: row.master_id,
    ota_hotel_id: row.ota_hotel_id,
    static_vm: row.static_vm,
    rates: row.rates,
  }),
)
const pins = new Map(
  otaRows.flatMap((row) => {
    const pin = otaMapHotelSchema.safeParse(row.map_hotel)
    return pin.success ? [[row.master_id, pin.data] as const] : []
  }),
)
const stay = searchStay({ hotels: raws })
const hotels = raws.map((raw) => otaHotel(raw, DESTINATION_ID, stay, pins.get(raw.master_id)))

const existing = new Map(
  (await readAll<HotelRow>('hotels', 'id,position,data', 'position'))
    .filter((row) => row.id.startsWith(REAL_HOTEL_ID_PREFIX))
    .map((row) => [row.id, row]),
)
const missing = hotels.filter((hotel) => !existing.has(hotel.id))
if (missing.length)
  throw new Error(`hotels has no row for ${missing.length} of the ota_hotels: run db:seed:valencia first`)
const orphans = [...existing.keys()].filter((id) => !hotels.some((hotel) => hotel.id === id))
if (orphans.length) throw new Error(`hotels has rows without ota_hotels: ${orphans.slice(0, 5).join(', ')}`)

// The row is compared as JSON: what the database stores is what the site reads.
const asStored = (value: unknown) => JSON.parse(JSON.stringify(value))
const changed = hotels.filter((hotel) => !isDeepStrictEqual(asStored(hotel), existing.get(hotel.id)!.data))
const rooms = (list: typeof hotels) => list.reduce((sum, hotel) => sum + hotel.rooms.length, 0)
const before = [...existing.values()].reduce(
  (sum, row) => sum + ((row.data as { rooms: unknown[] }).rooms?.length ?? 0),
  0,
)
const priceChanged = hotels.filter(
  (hotel) => (existing.get(hotel.id)!.data as { priceFrom: number }).priceFrom !== hotel.priceFrom,
)

console.log(`stay: ${stay.nights} nights from ${stay.checkIn}`)
console.log(`ota_hotels: ${otaRows.length}, hotels ota-*: ${existing.size}`)
console.log(`rooms: ${before} now, ${rooms(hotels)} rebuilt (from the rates)`)
console.log(`reviews left: ${hotels.reduce((sum, hotel) => sum + hotel.reviews.length, 0)}`)
console.log(`priceFrom changes: ${priceChanged.length}`)
console.log(`rows to rewrite: ${changed.length}`)

if (dryRun) {
  console.log('dry run: nothing written')
} else {
  const updatedAt = new Date().toISOString()
  for (let i = 0; i < changed.length; i += BATCH) {
    const rows = changed.slice(i, i + BATCH).map((hotel) => ({
      id: hotel.id,
      position: existing.get(hotel.id)!.position,
      destination_id: hotel.destinationId,
      stay_type: hotel.stayType,
      // The column allows 1…5: a hotel without stars keeps 0 in `data`, which the site reads.
      stars: Math.max(1, hotel.stars),
      rating: hotel.rating,
      price_from: hotel.priceFrom,
      wifi_mbps: hotel.wifiMbps,
      workspace: hotel.workspace,
      lat: hotel.lat,
      lon: hotel.lon,
      data: hotel as unknown as NonNullable<Database['public']['Tables']['hotels']['Insert']['data']>,
      updated_at: updatedAt,
    }))
    const { error } = await supabase.from('hotels').upsert(rows, { onConflict: 'id' })
    if (error) throw new Error(`hotels: ${error.message}`)
  }
  console.log(`hotels: ${changed.length} rewritten`)
}
