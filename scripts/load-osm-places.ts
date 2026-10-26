// Loads the places of OpenStreetMap of Valencia into `osm_places` (supabase/migrations/20261026130000_osm_places.sql)
// and records the rectangle with its categories in `osm_place_areas`, so the server answers them from the cache.
//   npm run db:osm-places                          Overpass, a query per group of categories
//   npm run db:osm-places -- --file <answer.json>   an Overpass JSON answer saved before, e.g. made from the Geofabrik
//                                                  extract by scripts/osm-pbf-to-overpass.py when Overpass is down
//   npm run db:osm-places -- --dry-run              counts only, writes nothing
// Upserts, so a second run updates the same rows; nothing is deleted. Needs NEXT_PUBLIC_SUPABASE_URL and
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
const { VALENCIA_BBOX } = await import('../src/lib/geo/distance.ts')
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

const { values } = parseArgs({ options: { file: { type: 'string' }, 'dry-run': { type: 'boolean' } } })

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set: run npm run secrets:reveal`)
  return value
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fromOverpass(): Promise<Rows> {
  const gate = new RateGate()
  const rows: Rows = []
  for (const group of GROUPS) {
    for (let attempt = 0; ; attempt++) {
      const budget = { deadline: Date.now() + QUERY_TIMEOUT_MS + 5000 }
      const result = await overpassPlaces(group, { bbox: VALENCIA_BBOX }, { budget, gate, timeoutMs: QUERY_TIMEOUT_MS })
      if (result.ok) {
        console.log(`overpass ${group.join(',')}: ${result.value.length} elements`)
        rows.push(...result.value)
        break
      }
      const wait = result.reason === 'limited' ? result.retryAfterS : BACKOFF_S[attempt]
      if (wait === undefined || attempt >= BACKOFF_S.length)
        throw new Error(`overpass ${group.join(',')}: ${result.message}`)
      console.log(`overpass ${group.join(',')}: ${result.message} — again in ${wait} s`)
      await sleep(wait * 1000)
    }
    await sleep(PAUSE_MS)
  }
  // An element of two groups (a restaurant that is an attraction) once, with all its categories.
  return [...new Map(rows.map((row) => [`${row.osm_type}/${row.osm_id}`, row])).values()]
}

async function fromFile(path: string): Promise<Rows> {
  const result = parseOverpass(JSON.parse(await readFile(path, 'utf8')))
  if (!result.ok) throw new Error(`${path}: ${result.message}`)
  return result.value
}

const rows = values.file ? await fromFile(values.file) : await fromOverpass()
const counts = Object.fromEntries(PLACE_CATEGORIES.map((c) => [c, rows.filter((r) => r.categories.includes(c)).length]))
console.log(`places: ${rows.length}`)
for (const [category, count] of Object.entries(counts)) console.log(`  ${category}: ${count}`)
if (values['dry-run']) process.exit(0)

const supabase = createClient<Database>(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})
if (!(await saveRows(supabase, rows, 'preload'))) throw new Error('osm_places: the upsert failed')

// The rectangle once: a second run finds it and adds none.
const { south, west, north, east } = VALENCIA_BBOX
const area = `SRID=4326;POLYGON((${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}))`
const { data: areas, error: areasError } = await supabase
  .from('osm_place_areas')
  .select('id, categories')
  .eq('origin', 'preload')
if (areasError) throw new Error(`osm_place_areas: ${areasError.message}`)
const loaded = areas.some((a) => PLACE_CATEGORIES.every((c) => a.categories.includes(c)))
if (!loaded) {
  const { error } = await supabase
    .from('osm_place_areas')
    .insert({ categories: [...PLACE_CATEGORIES], area, origin: 'preload' })
  if (error) throw new Error(`osm_place_areas: ${error.message}`)
}
const { count, error } = await supabase.from('osm_places').select('osm_id', { count: 'exact', head: true })
if (error) throw new Error(`osm_places: ${error.message}`)
console.log(
  `osm_places: ${rows.length} upserted, ${count} in the table; area ${loaded ? 'already recorded' : 'recorded'}`,
)
