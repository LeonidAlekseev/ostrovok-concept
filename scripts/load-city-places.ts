// The places of OpenStreetMap of a city for Эвал's geo tools, the whole run in one step:
//   npm run db:city-places -- --city <name> --pbf-url <Geofabrik .osm.pbf> [--bbox s,w,n,e] [--centre lat,lon]
//                             [--margin-km 3] [--tmp <dir>] [--overpass] [--dry-run]
// 1. the rectangle and the centre: given, or the city's from Nominatim (the rectangle grown by --margin-km);
// 2. with --overpass, the load straight from Overpass (one try per group); when it fails, the extract below;
// 3. the free disk is checked against the extract's size, then the extract is downloaded (and its .md5 checked);
// 4. scripts/osm-pbf-to-overpass.py cuts it to the rectangle and the categories (uv runs it);
// 5. scripts/load-osm-places.ts writes the places and the rectangle (`preload`) and counts them by category;
// 6. the temporary files go, whatever happened.
// Idempotent: a second run updates the same rows and records the rectangle once. --dry-run downloads and counts but
// writes nothing. Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local) unless --dry-run;
// prints counts, never the keys. Example, Valencia (README, «Загрузка мест другого города»):
//   npm run db:city-places -- --city València --pbf-url https://download.geofabrik.de/europe/spain/valencia-latest.osm.pbf \
//     --bbox 39.27,-0.53,39.58,-0.27
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, rmSync } from 'node:fs'
import { mkdir, mkdtemp, rm, stat, statfs } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

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

const { citySlug, formatBbox, growBbox, isPbfUrl, parseBbox, parseLatLon, parseNominatimCity, requiredFreeBytes } =
  await import('../src/lib/geo/cityLoad.ts')
const { USER_AGENT } = await import('../src/lib/geo/http.ts')

const HELP = `usage: npm run db:city-places -- --city <name> --pbf-url <https://download.geofabrik.de/….osm.pbf>
  [--bbox south,west,north,east] [--centre lat,lon] [--margin-km 3] [--tmp <dir>] [--overpass] [--dry-run]
Without --bbox or --centre they come from Nominatim for --city. Example, Valencia:
  npm run db:city-places -- --city València \\
    --pbf-url https://download.geofabrik.de/europe/spain/valencia-latest.osm.pbf --bbox 39.27,-0.53,39.58,-0.27`

const root = fileURLToPath(new URL('..', import.meta.url))
const { values } = parseArgs({
  options: {
    city: { type: 'string' },
    'pbf-url': { type: 'string' },
    bbox: { type: 'string' },
    centre: { type: 'string' },
    'margin-km': { type: 'string', default: '3' },
    tmp: { type: 'string', default: tmpdir() },
    overpass: { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    help: { type: 'boolean' },
  },
})

function fail(message: string): never {
  console.error(`load-city-places: ${message}`)
  process.exit(1)
}

if (values.help) {
  console.log(HELP)
  process.exit(0)
}
const city = values.city?.trim()
if (!city) fail(`--city is required\n${HELP}`)
const pbfUrl = values['pbf-url']
if (pbfUrl && !isPbfUrl(pbfUrl)) fail(`--pbf-url must be an https URL of a .osm.pbf extract, got ${pbfUrl}`)
if (!pbfUrl && !values.overpass) fail(`--pbf-url is required (or --overpass to load from Overpass only)\n${HELP}`)
const marginKm = Number(values['margin-km'])
if (!Number.isFinite(marginKm) || marginKm < 0 || marginKm > 50)
  fail(`--margin-km must be 0…50, got ${values['margin-km']}`)
if (!values['dry-run'])
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
    if (!process.env[name]) fail(`${name} is not set: run npm run secrets:reveal`)

/** Runs a step with the output on the console: `false` when it failed, a throw when it could not start. */
function run(step: string, command: string, args: string[]): boolean {
  console.log(`\n== ${step}`)
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env })
  if (result.error) throw new Error(`${step}: ${result.error.message}`)
  return result.status === 0
}

// 1. The rectangle and the centre.
let bbox: ReturnType<typeof parseBbox>
let centre: ReturnType<typeof parseLatLon>
try {
  const given = { bbox: values.bbox && parseBbox(values.bbox), centre: values.centre && parseLatLon(values.centre) }
  if (given.bbox && given.centre) {
    bbox = given.bbox
    centre = given.centre
  } else {
    const params = new URLSearchParams({ q: city, format: 'jsonv2', limit: '5', featureType: 'settlement' })
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) fail(`Nominatim answered HTTP ${response.status} for «${city}»: give --bbox and --centre`)
    const found = parseNominatimCity(await response.json())
    if (!found) fail(`Nominatim does not know the city «${city}»: give --bbox and --centre`)
    console.log(`Nominatim: ${found.name}, centre ${found.lat},${found.lon}, box ${formatBbox(found.bbox)}`)
    bbox = given.bbox || growBbox(found.bbox, marginKm)
    centre = given.centre || { lat: found.lat, lon: found.lon }
  }
} catch (error) {
  fail((error as Error).message)
}
console.log(`${city}: rectangle ${formatBbox(bbox)}, centre ${centre.lat},${centre.lon}`)
const loadArgs = ['scripts/load-osm-places.ts', '--bbox', formatBbox(bbox), '--centre', `${centre.lat},${centre.lon}`]
if (values['dry-run']) loadArgs.push('--dry-run')

// 2. Overpass first, when asked.
if (values.overpass) {
  let loaded = false
  try {
    loaded = run('load from Overpass', process.execPath, [...loadArgs, '--retries', '1'])
  } catch (error) {
    fail((error as Error).message)
  }
  if (loaded) process.exit(0)
  if (!pbfUrl) fail('Overpass failed and there is no --pbf-url to fall back to')
  console.log('Overpass failed: loading from the extract')
}
if (spawnSync('uv', ['--version'], { stdio: 'ignore' }).status !== 0)
  fail('uv is not installed: https://docs.astral.sh/uv/ (it runs scripts/osm-pbf-to-overpass.py)')

// 3–6. The extract, in a directory of this run only, removed at the end.
await mkdir(values.tmp, { recursive: true })
const work = await mkdtemp(join(values.tmp, `osm-places-${citySlug(city)}-`))
// An interrupt skips `finally` too: the directory goes before the exit.
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    rmSync(work, { recursive: true, force: true })
    console.error(`\nload-city-places: interrupted, removed ${work}`)
    process.exit(130)
  })

/** Steps 3–5 in `work`; a failure throws, so the directory is removed before the run ends. */
async function loadExtract(work: string) {
  const head = await fetch(pbfUrl!, { method: 'HEAD', headers: { 'user-agent': USER_AGENT }, redirect: 'follow' })
  const size = Number(head.headers.get('content-length'))
  if (!head.ok || !Number.isFinite(size) || size <= 0) throw new Error(`${pbfUrl}: HTTP ${head.status}, no size`)
  const disk = await statfs(work)
  const free = disk.bavail * disk.bsize
  const need = requiredFreeBytes(size)
  const mb = (n: number) => `${Math.round(n / 1024 ** 2)} MB`
  if (free < need) throw new Error(`${mb(free)} free in ${values.tmp}, the extract of ${mb(size)} needs ${mb(need)}`)
  console.log(`\n== download ${pbfUrl} (${mb(size)}; ${mb(free)} free)`)

  const pbf = join(work, 'extract.osm.pbf')
  const download = await fetch(pbfUrl!, { headers: { 'user-agent': USER_AGENT } })
  if (!download.ok || !download.body) throw new Error(`${pbfUrl}: HTTP ${download.status}`)
  await pipeline(Readable.fromWeb(download.body as WebReadableStream), createWriteStream(pbf))
  if ((await stat(pbf)).size !== size) throw new Error(`${pbfUrl}: the download is incomplete`)
  const md5 = await fetch(`${pbfUrl}.md5`, { headers: { 'user-agent': USER_AGENT } }).catch(() => undefined)
  if (md5?.ok) {
    const expected = (await md5.text()).trim().split(/\s+/)[0]
    const hash = createHash('md5')
    await pipeline(createReadStream(pbf), hash)
    if (hash.digest('hex') !== expected) throw new Error(`${pbfUrl}: the md5 does not match`)
    console.log('md5 ok')
  }

  const answer = join(work, 'places.json')
  if (
    !run('cut to the rectangle and the categories', 'uv', [
      'run',
      '-q',
      'scripts/osm-pbf-to-overpass.py',
      pbf,
      answer,
      formatBbox(bbox),
    ])
  )
    throw new Error('scripts/osm-pbf-to-overpass.py failed')
  await rm(pbf)
  if (!run(values['dry-run'] ? 'count (dry run)' : 'load and check', process.execPath, [...loadArgs, '--file', answer]))
    throw new Error('scripts/load-osm-places.ts failed')
}

let failure: Error | undefined
try {
  await loadExtract(work)
} catch (error) {
  failure = error instanceof Error ? error : new Error(String(error))
} finally {
  await rm(work, { recursive: true, force: true })
  console.log(`\nremoved ${work}`)
}
if (failure) fail(failure.message)
