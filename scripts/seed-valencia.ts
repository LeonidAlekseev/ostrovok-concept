// Loads an Ostrovok search of Valencia into Supabase: the raw hotels into `ota_hotels`, the rest of the search into
// `ota_searches`, and the hotels as the catalogue's (`ota-<master_id>`) into `destinations` and `hotels`.
//   npm run db:seed:valencia -- <search.json>   (Node runs the TypeScript itself; the keys come from .env.local)
// Upserts, so a second run leaves the same rows; touches no other city. Needs NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY; prints counts, never the keys. The site sees the hotels after its catalogue cache
// expires (an hour) or after `POST /api/revalidate`.
import { readFile } from 'node:fs/promises'
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

const { destinations } = await import('../src/data/destinations.ts')
const { buildCatalog } = await import('../src/lib/catalogGenerator.ts')
const { otaHotel, searchStay } = await import('../src/lib/ota/hotel.ts')
const { otaSearchSchema } = await import('../src/lib/ota/search.ts')

const DESTINATION_ID = 'valencia'
// Rows of jsonb a request: small enough for the database's short statement timeout.
const BATCH = 50

const { positionals } = parseArgs({ allowPositionals: true })
if (positionals.length !== 1) throw new Error('usage: npm run db:seed:valencia -- <search.json>')

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set: run npm run secrets:reveal`)
  return value
}

const supabase = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function upsert(table: string, key: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + BATCH), { onConflict: key })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
  const { count, error } = await supabase.from(table).select(key, { count: 'exact', head: true })
  if (error) throw new Error(`${table}: ${error.message}`)
  console.log(`${table}: ${rows.length} upserted, ${count} in the table`)
}

// The whole objects go to the database; the schema checks only what the catalogue reads.
const json = JSON.parse(await readFile(positionals[0], 'utf8')) as {
  hotels: { master_id: number; static_vm: Record<string, unknown>; [key: string]: unknown }[]
  map_hotels: { master_id: number; [key: string]: unknown }[]
  [key: string]: unknown
}
const search = otaSearchSchema.parse(json)
const destinationIndex = destinations.findIndex((d) => d.id === DESTINATION_ID)
const destination = destinations[destinationIndex]
if (!destination) throw new Error(`src/data/destinations.ts has no ${DESTINATION_ID}`)

const ids = new Set(search.hotels.map((h) => h.master_id))
if (ids.size !== search.hotels.length) throw new Error('the search has a master_id twice')
const pins = new Map(search.map_hotels.map((pin) => [pin.master_id, pin]))
const rawPins = new Map(json.map_hotels.map((pin) => [pin.master_id, pin]))
const stay = searchStay(search)
const hotels = search.hotels.map((raw) => otaHotel(raw, DESTINATION_ID, stay, pins.get(raw.master_id)))
const cheapest = Math.min(...hotels.map((h) => h.priceFrom))
if (cheapest !== destination.priceFrom)
  throw new Error(`the cheapest night is ${cheapest} ₽: set priceFrom of ${DESTINATION_ID} in src/data/destinations.ts`)
console.log(`search: ${search.hotels.length} hotels, ${stay.nights} nights from ${stay.checkIn}`)

const updatedAt = new Date().toISOString()
await upsert(
  'ota_hotels',
  'master_id',
  json.hotels.map(({ master_id, ota_hotel_id, static_vm, rates, marketing_badges }) => ({
    master_id,
    ota_hotel_id,
    name: static_vm.name,
    lat: static_vm.latitude,
    lon: static_vm.longitude,
    static_vm,
    rates: rates ?? [],
    marketing_badges: marketing_badges ?? null,
    map_hotel: rawPins.get(master_id) ?? null,
    updated_at: updatedAt,
  })),
)
const { hotels: _hotels, map_hotels: _pins, ...payload } = json
const regionSlug = String(json.hotels[0].static_vm.region_catalog_slug)
await upsert('ota_searches', 'id', [{ id: DESTINATION_ID, region_slug: regionSlug, payload, updated_at: updatedAt }])
await upsert('destinations', 'id', [
  { id: destination.id, position: destinationIndex, data: destination, updated_at: updatedAt },
])
// After the generated catalogue, in the search's order.
const firstPosition = buildCatalog().length
await upsert(
  'hotels',
  'id',
  hotels.map((hotel, index) => ({
    id: hotel.id,
    position: firstPosition + index,
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
    data: hotel,
    updated_at: updatedAt,
  })),
)
const { count, error } = await supabase
  .from('hotels')
  .select('id', { count: 'exact', head: true })
  .eq('destination_id', DESTINATION_ID)
if (error) throw new Error(`hotels: ${error.message}`)
console.log(`hotels of ${DESTINATION_ID}: ${count}`)
