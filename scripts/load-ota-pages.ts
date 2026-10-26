// Loads the licensed snapshots of the Ostrovok pages of the real hotels (`<dir>/<master_id>.json`) into Supabase:
// the page's hotel without its contacts and the reviews into `ota_hotel_pages`, the places of interest once each with
// their point into `ota_pois`, the hotel's distance to each into `ota_hotel_pois`, the rate tags into
// `ota_rate_spec_tags`. The analytics, the settings, the CSP and the rest of the page are not kept.
//   npm run db:load:ota-pages -- <dir> [--dry-run]   (Node runs the TypeScript itself; the keys come from .env.local)
// The files are untrusted data: only JSON is parsed, a file over 4 MB, a name other than `<master_id>.json`, a page
// of another hotel or a hotel not in `ota_hotels` stops the load before anything is written. Upserts and deletes the
// stale places of the loaded hotels, so a second run over the same files writes the same rows. Needs
// NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; prints counts, never the keys or the contents.
// Afterwards: npm run db:rebuild:ota (the description, the times, the Wi‑Fi of the hotels), then npm run db:embed.
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { registerHooks } from 'node:module'
import { parseArgs } from 'node:util'
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

const { nextDataPageProps, trimPage } = await import('../src/lib/ota/page.ts')
type TrimmedPage = import('../src/lib/ota/page.ts').TrimmedPage

const MAX_FILE_BYTES = 4 * 1024 * 1024
// Rows of jsonb a request: small enough for the database's short statement timeout.
const BATCH = 20
const ROW_BATCH = 500
/** A table of the schema, for the helpers that take its name. */
type Table = keyof Database['public']['Tables']

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'dry-run': { type: 'boolean', default: false } },
})
if (positionals.length !== 1) throw new Error('usage: npm run db:load:ota-pages -- <dir> [--dry-run]')
const dir = positionals[0]
const dryRun = values['dry-run']

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set: run npm run secrets:reveal`)
  return value
}

const supabase = createClient<Database>(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort()
const pages: TrimmedPage[] = []
for (const name of names) {
  const match = /^(\d{1,15})\.json$/.exec(name)
  if (!match) throw new Error(`${name}: not <master_id>.json`)
  const path = join(dir, name)
  const info = await stat(path)
  if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error(`${name}: not a file of at most 4 MB`)
  const page = trimPage(nextDataPageProps(JSON.parse(await readFile(path, 'utf8'))))
  if (page.masterId !== Number(match[1])) throw new Error(`${name}: the page is of hotel ${page.masterId}`)
  pages.push(page)
}

const { data: known, error: knownError } = await supabase.from('ota_hotels').select('master_id')
if (knownError) throw new Error(`ota_hotels: ${knownError.message}`)
const otaIds = new Set(known.map((row) => Number(row.master_id)))
const strangers = pages.filter((page) => !otaIds.has(page.masterId))
if (strangers.length)
  throw new Error(
    `not in ota_hotels: ${strangers
      .slice(0, 5)
      .map((p) => p.masterId)
      .join(', ')} — run db:seed:valencia`,
  )

// The places once each: the last page's copy of a place wins, they are the same.
const pois = new Map(pages.flatMap((page) => page.pois.map((poi) => [poi.regionId, poi] as const)))
const hotelPois = pages.flatMap((page) =>
  page.hotelPois.map((p) => ({
    master_id: page.masterId,
    region_id: p.regionId,
    distance_m: Math.round(p.distance),
    is_nearby: p.isNearby,
    is_top_poi: p.isTopPoi,
    is_transport_hub: p.isTransportHub,
  })),
)
// The names of a place: the page's places have them where the hotel's own list has an empty one.
const hotelNames = new Map(
  pages.flatMap((page) => page.hotelPois.map((p) => [p.regionId, { name: p.name, nameEn: p.nameEn }] as const)),
)
const tags = new Map(pages.flatMap((page) => page.rateTags.map((tag) => [tag.name, tag] as const)))
const reviews = pages.reduce((sum, page) => sum + ((page.reviews.list as unknown[] | undefined)?.length ?? 0), 0)

console.log(`files: ${names.length}, pages: ${pages.length} of ${otaIds.size} ota_hotels`)
console.log(`places: ${pois.size}, hotel–place links: ${hotelPois.length}, reviews (list): ${reviews}`)
console.log(`rate tags: ${tags.size}`)
if (dryRun) {
  console.log('dry run: nothing written')
  process.exit(0)
}

async function upsert(table: Table, key: string, rows: Record<string, unknown>[], batch = ROW_BATCH) {
  for (let i = 0; i < rows.length; i += batch) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + batch) as never, { onConflict: key })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
  const { count, error } = await supabase.from(table).select(key.split(',')[0], { count: 'exact', head: true })
  if (error) throw new Error(`${table}: ${error.message}`)
  console.log(`${table}: ${rows.length} upserted, ${count} in the table`)
}

const updatedAt = new Date().toISOString()
await upsert(
  'ota_pois',
  'region_id',
  [...pois.values()].map((poi) => ({
    region_id: poi.regionId,
    type: poi.type,
    subtype: poi.subtype,
    name: poi.name || hotelNames.get(poi.regionId)?.name || '',
    name_en: poi.nameEn || hotelNames.get(poi.regionId)?.nameEn || '',
    genitive: poi.inflection?.genitive || null,
    locative_in: poi.inflection?.locativeIn || null,
    catalog_slug: poi.catalogSlug || null,
    // EWKT: PostgREST hands the text to the geometry column's input.
    geom: `SRID=4326;POINT(${poi.center.lng} ${poi.center.lat})`,
    updated_at: updatedAt,
  })),
)
await upsert(
  'ota_hotel_pages',
  'master_id',
  pages.map((page) => ({ master_id: page.masterId, hotel: page.hotel, reviews: page.reviews, updated_at: updatedAt })),
  BATCH,
)
await upsert(
  'ota_hotel_pois',
  'master_id,region_id',
  hotelPois.map((row) => ({ ...row, updated_at: updatedAt })),
)
// A place a loaded hotel's page no longer has.
const { error: staleError, count: stale } = await supabase
  .from('ota_hotel_pois')
  .delete({ count: 'exact' })
  .in(
    'master_id',
    pages.map((page) => page.masterId),
  )
  .lt('updated_at', updatedAt)
if (staleError) throw new Error(`ota_hotel_pois: ${staleError.message}`)
console.log(`ota_hotel_pois: ${stale ?? 0} stale deleted`)
await upsert(
  'ota_rate_spec_tags',
  'name',
  [...tags.values()].map((tag) => ({
    name: tag.name,
    translation: tag.translation,
    priority: tag.priority,
    adj_kind: tag.adjKind,
    updated_at: updatedAt,
  })),
)
