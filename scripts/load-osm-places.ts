// Loads the places of OpenStreetMap of a city's rectangle into `osm_places`
// (supabase/migrations/20261026130000_osm_places.sql) and records the rectangle with its categories in
// `osm_place_areas`, so the server answers them from the cache. The whole run for a city, from the download of the
// extract to the check, is scripts/load-city-places.ts; this is its loading step.
//   npm run db:osm-places -- --bbox <s,w,n,e> [--centre <lat,lon>]               Overpass, a query per group
//   npm run db:osm-places -- --bbox <s,w,n,e> --file <answer.json>               an Overpass JSON answer saved before
//                                                  (scripts/osm-pbf-to-overpass.py makes one from a Geofabrik extract)
//   … --dry-run      counts only, writes nothing
//   … --retries <n>  tries of an Overpass group after a refusal (default 4)
// `--centre` keeps the `centre` category on the town node nearest to it only. Upserts, so a second run updates the
// same rows and records the rectangle once; nothing is deleted. Needs NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY; prints counts, never the keys. The places are © OpenStreetMap contributors, ODbL 1.0.
import { readFile } from 'node:fs/promises'
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

const { PLACE_CATEGORIES } = await import('../src/lib/geo/categories.ts')
const { bboxPolygon, formatBbox, keepOneCentre, parseBbox, parseLatLon } = await import('../src/lib/geo/cityLoad.ts')
const { RateGate } = await import('../src/lib/geo/limits.ts')
const { overpassPlaces, parseOverpass } = await import('../src/lib/geo/overpass.ts')
const { saveRows } = await import('../src/lib/geo/save.ts')

type PlaceCategory = (typeof PLACE_CATEGORIES)[number]
type Rows = Extract<ReturnType<typeof parseOverpass>, { ok: true }>['value']

/** A query per group: each small enough for the public server, and a failure costs one group. */
const GROUPS: PlaceCategory[][] = [
  ['hospital', 'clinic', 'pharmacy'],
  ['bar', 'nightclub', 'restaurant', 'fast_food', 'cafe'],
  ['supermarket', 'convenience'],
  ['metro', 'tram', 'train_station', 'bus_stop', 'airport'],
  ['beach', 'sea', 'park'],
  ['attraction', 'viewpoint', 'museum', 'centre'],
]
const QUERY_TIMEOUT_MS = 180_000
/** The waits after a refusal (429, 502 «at capacity», a timeout) before the next try of a group. */
const BACKOFF_S = [30, 60, 120, 240]
const PAUSE_MS = 10_000

const { values } = parseArgs({
  options: {
    bbox: { type: 'string' },
    centre: { type: 'string' },
    file: { type: 'string' },
    retries: { type: 'string', default: String(BACKOFF_S.length) },
    'dry-run': { type: 'boolean' },
  },
})

function fail(message: string): never {
  console.error(`load-osm-places: ${message}`)
  process.exit(1)
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) fail(`${name} is not set: run npm run secrets:reveal`)
  return value
}

if (!values.bbox) fail('--bbox south,west,north,east is required (see scripts/load-city-places.ts)')
let bbox: ReturnType<typeof parseBbox>
let centre: ReturnType<typeof parseLatLon> | undefined
try {
  bbox = parseBbox(values.bbox)
  centre = values.centre ? parseLatLon(values.centre) : undefined
} catch (error) {
  fail((error as Error).message)
}
const retries = Number(values.retries)
if (!Number.isInteger(retries) || retries < 0 || retries > BACKOFF_S.length)
  fail(`--retries must be 0…${BACKOFF_S.length}, got ${values.retries}`)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fromOverpass(): Promise<Rows> {
  const gate = new RateGate()
  const rows: Rows = []
  for (const group of GROUPS) {
    for (let attempt = 0; ; attempt++) {
      const budget = { deadline: Date.now() + QUERY_TIMEOUT_MS + 5000 }
      const result = await overpassPlaces(group, { bbox }, { budget, gate, timeoutMs: QUERY_TIMEOUT_MS })
      if (result.ok) {
        console.log(`overpass ${group.join(',')}: ${result.value.length} elements`)
        rows.push(...result.value)
        break
      }
      const wait = result.reason === 'limited' ? result.retryAfterS : BACKOFF_S[attempt]
      if (attempt >= retries || wait === undefined) fail(`overpass ${group.join(',')}: ${result.message}`)
      console.log(`overpass ${group.join(',')}: ${result.message} — again in ${wait} s`)
      await sleep(wait * 1000)
    }
    await sleep(PAUSE_MS)
  }
  // An element of two groups (a restaurant that is an attraction) once, with all its categories.
  return [...new Map(rows.map((row) => [`${row.osm_type}/${row.osm_id}`, row])).values()]
}

async function fromFile(path: string): Promise<Rows> {
  const text = await readFile(path, 'utf8').catch((error: Error) => fail(`${path}: ${error.message}`))
  const result = parseOverpass(JSON.parse(text))
  if (!result.ok) fail(`${path}: ${result.message}`)
  return result.value
}

const countBy = (rows: Rows) =>
  Object.fromEntries(PLACE_CATEGORIES.map((c) => [c, rows.filter((r) => r.categories.includes(c)).length]))

const rows = keepOneCentre(values.file ? await fromFile(values.file) : await fromOverpass(), centre)
console.log(`rectangle ${formatBbox(bbox)}: ${rows.length} places`)
for (const [category, count] of Object.entries(countBy(rows))) console.log(`  ${category}: ${count}`)
if (values['dry-run']) process.exit(0)

const supabase = createClient<Database>(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})
if (!(await saveRows(supabase, rows, 'preload'))) fail('osm_places: the upsert failed')

// The rectangle once: a second run finds the same polygon with all the categories and adds none.
const area = bboxPolygon(bbox)
const { data: areas, error: areasError } = await supabase
  .from('osm_place_areas')
  .select('id, categories')
  .eq('origin', 'preload')
  .eq('area', area)
if (areasError) fail(`osm_place_areas: ${areasError.message}`)
const loaded = areas.some((a) => PLACE_CATEGORIES.every((c) => a.categories.includes(c)))
if (!loaded) {
  const { error } = await supabase
    .from('osm_place_areas')
    .insert({ categories: [...PLACE_CATEGORIES], area, origin: 'preload' })
  if (error) fail(`osm_place_areas: ${error.message}`)
}

// The check: what the table now holds in the rectangle, per category.
console.log(`osm_places: ${rows.length} upserted; area ${loaded ? 'already recorded' : 'recorded'}; in the rectangle:`)
let total = 0
for (const category of PLACE_CATEGORIES) {
  const { count, error } = await supabase
    .from('osm_places')
    .select('osm_id', { count: 'exact', head: true })
    .contains('categories', [category])
    .gte('lat', bbox.south)
    .lte('lat', bbox.north)
    .gte('lon', bbox.west)
    .lte('lon', bbox.east)
  if (error) fail(`osm_places: ${error.message}`)
  total += count ?? 0
  console.log(`  ${category}: ${count}`)
}
const { count, error } = await supabase.from('osm_places').select('osm_id', { count: 'exact', head: true })
if (error) fail(`osm_places: ${error.message}`)
console.log(`osm_places: ${count} in the table (category hits in the rectangle: ${total})`)
