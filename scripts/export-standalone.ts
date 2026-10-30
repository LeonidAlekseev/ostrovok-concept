// Exports, once, everything the standalone demo (the `standalone` branch) shows into files of the repository, while the
// live database still exists. ONLY reads: GET of PostgREST and the `stable` functions of the whitelist below.
//   STANDALONE_APP_DIR=<a checkout of dev> node --env-file-if-exists=.env scripts/export-standalone.ts \
//     [--tables] [--browser] [--rpc] [--maps] [--catalog] [--remap]   (the first four by default)
//
// * `--tables`: the rows the site reads (`data/standalone/tables/<table>.json.gz`) and their vectors, float32 in a row,
//   row-aligned (`data/standalone/vectors/<table>.f32`, `__vec` of a row is its index, -1 without a vector). Only the
//   demo accounts' chats are taken (all the chats of the database are theirs; a chat of anybody else is skipped).
// * `--rpc`: the answers of the PostGIS functions the pages ask with a hotel's point (the view of every floor and side,
//   the sight lines, the noise at the facade, the places near…). A recording proxy stands between a local `next dev`
//   and Supabase, the script opens every real hotel's page and API routes, and the proxy keeps each function's answer
//   by its name and arguments (`data/standalone/rpc.json.gz`). The proxy forwards only GET and the whitelisted
//   `stable` functions: any other request is refused, so nothing is written.
// * `--maps`: the noise and view maps of every real hotel as the API routes give them, as static files
//   (`public/standalone/maps/`): the tiles of the buildings and of the noise are shared by the hotels (see `writeMaps`).
// * `--browser`: what the browser starts from (`data/standalone/browser.json`), of the tables already exported.
// * `--catalog`: the catalogue's functions without arguments, added to `rpc.json.gz` (part of `--rpc`).
// * `--remap`: the maps written again from their own files (after a change of the simplification), no crawl.
// The crawl opens `next dev` of STANDALONE_APP_DIR: the full version with Supabase, never the standalone branch.
//
// Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DEMO_USER_EMAIL and
// DEMO_HOTELIER_EMAIL; prints counts and sizes, never a key.
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'
import { callKey } from '../src/lib/standalone/canonical.ts'

const { values: options } = parseArgs({
  options: {
    tables: { type: 'boolean', default: false },
    rpc: { type: 'boolean', default: false },
    maps: { type: 'boolean', default: false },
    browser: { type: 'boolean', default: false },
    remap: { type: 'boolean', default: false },
    catalog: { type: 'boolean', default: false },
  },
})
const all = !options.tables && !options.rpc && !options.maps && !options.browser && !options.remap && !options.catalog

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set: run npm run secrets:reveal`)
  return value
}

const ROOT = new URL('..', import.meta.url).pathname
const OUT = join(ROOT, 'data/standalone')
const PUBLIC_OUT = join(ROOT, 'public/standalone')
/**
 * The checkout whose `next dev` the crawl opens: the full version with Supabase (a worktree of `dev`), never this one —
 * on the `standalone` branch the site reads the snapshot itself.
 */
const APP = process.env.STANDALONE_APP_DIR ?? ROOT
const url = required('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '')
const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY')
const PAGE = 1000

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

/**
 * Every row of a table or view, by pages of `size` in a stable order; a page that outlasts the statement timeout is
 * asked again, up to three times.
 */
async function readAll(table: string, order: string, filter = '', size = PAGE): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += size) {
    let page: Record<string, unknown>[] | null = null
    for (let attempt = 1; !page; attempt += 1) {
      const response = await fetch(`${url}/rest/v1/${table}?select=*&order=${order}${filter}`, {
        headers: { ...headers, 'Range-Unit': 'items', Range: `${from}-${from + size - 1}` },
      })
      if (response.ok) page = (await response.json()) as Record<string, unknown>[]
      else if (attempt === 3) throw new Error(`${table}: ${response.status} ${(await response.text()).slice(0, 200)}`)
      else await new Promise((r) => setTimeout(r, 3000))
    }
    rows.push(...page)
    if (page.length < size) return rows
  }
}

const gz = (value: unknown) => gzipSync(JSON.stringify(value), { level: 9 })

function write(path: string, data: Buffer | string) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, data)
  console.log(`  ${path.slice(ROOT.length)}: ${(Buffer.byteLength(data) / 1024).toFixed(0)} KB`)
}

/** The tables, their order and the vector column taken out of the rows. */
const TABLES: { table: string; order: string; vector?: string; drop?: string[]; filter?: string; geometry?: string }[] =
  [
    { table: 'destinations', order: 'id' },
    { table: 'hotels', order: 'id' },
    { table: 'ota_hotel_pages', order: 'master_id' },
    { table: 'ota_hotel_places', order: 'hotel_id' },
    { table: 'hotel_features', order: 'hotel_id' },
    { table: 'hotel_room_views_named', order: 'hotel_id,rg_hash' },
    { table: 'entities', order: 'id' },
    { table: 'claims', order: 'id' },
    { table: 'claim_evidence', order: 'claim_id,evidence_id' },
    { table: 'evidence', order: 'id' },
    { table: 'calculations', order: 'id' },
    { table: 'relations', order: 'id' },
    { table: 'documents', order: 'id' },
    { table: 'document_chunks', order: 'id', vector: 'embedding', drop: ['fts'] },
    { table: 'embeddings', order: 'kind,ref_id', vector: 'embedding' },
    { table: 'hotel_photo_embeddings', order: 'hotel_id,photo_key', vector: 'embedding' },
    { table: 'osm_places', order: 'osm_type,osm_id', geometry: 'geom' },
    { table: 'osm_place_areas', order: 'id', geometry: 'area' },
  ]

/** The demo accounts' rows: their chats with Эвал and with the hotelier, the profiles. */
const DEMO_TABLES: { table: string; order: string; by: 'user_id' | 'id' | 'conversation' | 'chat' }[] = [
  { table: 'profiles', order: 'id', by: 'id' },
  { table: 'hotelier_profiles', order: 'user_id', by: 'user_id' },
  { table: 'assistant_chats', order: 'id', by: 'user_id' },
  { table: 'assistant_messages', order: 'id', by: 'user_id' },
  { table: 'tool_runs', order: 'id', by: 'user_id' },
  { table: 'tool_run_evidence', order: 'tool_run_id,evidence_id', by: 'user_id' },
  { table: 'hotelier_conversations', order: 'id', by: 'user_id' },
  { table: 'hotelier_requests', order: 'id', by: 'user_id' },
  { table: 'hotelier_messages', order: 'id', by: 'conversation' },
]

async function userIdByEmail(email: string): Promise<string> {
  for (let page = 1; ; page += 1) {
    const response = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=${PAGE}`, { headers })
    if (!response.ok) throw new Error(`users: ${response.status}`)
    const { users } = (await response.json()) as { users: { id: string; email?: string }[] }
    const user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (user) return user.id
    if (users.length < PAGE) throw new Error(`no account for the demo email`)
  }
}

/** A geometry of PostgREST (hex EWKB: points, lines, polygons and their multis) as GeoJSON, 6 decimals. */
function geoJsonOf(hex: string): { type: string; coordinates: unknown } | null {
  const buffer = Buffer.from(hex, 'hex')
  let at = 0
  const round = (v: number) => Math.round(v * 1e6) / 1e6
  const geometry = (): { type: string; coordinates: unknown } | null => {
    const little = buffer[at] === 1
    at += 1
    const u32 = () => {
      const v = little ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at)
      at += 4
      return v
    }
    const f64 = () => {
      const v = little ? buffer.readDoubleLE(at) : buffer.readDoubleBE(at)
      at += 8
      return v
    }
    const raw = u32()
    if (raw & 0x20000000) u32()
    const dims = 2 + (raw & 0x80000000 ? 1 : 0) + (raw & 0x40000000 ? 1 : 0)
    const point = () => {
      const p = [round(f64()), round(f64())]
      for (let i = 2; i < dims; i += 1) f64()
      return p
    }
    const ring = () => Array.from({ length: u32() }, point)
    switch (raw & 0xff) {
      case 1:
        return { type: 'Point', coordinates: point() }
      case 2:
        return { type: 'LineString', coordinates: ring() }
      case 3:
        return { type: 'Polygon', coordinates: Array.from({ length: u32() }, ring) }
      case 4:
      case 5:
      case 6: {
        const type = ['MultiPoint', 'MultiLineString', 'MultiPolygon'][(raw & 0xff) - 4]
        return { type, coordinates: Array.from({ length: u32() }, () => geometry()?.coordinates) }
      }
      default:
        return null
    }
  }
  return geometry()
}

/** A halfvec of PostgREST (`"[0.1,…]"`) as numbers. */
const vectorOf = (value: unknown): number[] | null =>
  typeof value === 'string' ? (JSON.parse(value) as number[]) : Array.isArray(value) ? (value as number[]) : null

async function exportTables() {
  console.log('tables')
  for (const { table, order, vector, drop = [], filter = '', geometry } of TABLES) {
    const rows = await readAll(table, order, filter, vector ? 200 : PAGE)
    const vectors: number[][] = []
    for (const row of rows) {
      for (const column of drop) delete row[column]
      if (geometry) {
        // A point is its lat/lon already; a line or an area keeps its shape as GeoJSON, ~1 m precise.
        // PostgREST gives a geography as hex EWKB and a geometry as GeoJSON (with its `crs`).
        const value = row[geometry] as string | { type: string; coordinates: unknown } | null
        const shape =
          typeof value === 'string'
            ? geoJsonOf(value)
            : value
              ? { type: value.type, coordinates: value.coordinates }
              : null
        delete row[geometry]
        if (shape && shape.type !== 'Point') row.geometry = shape
      }
      if (!vector) continue
      const values = vectorOf(row[vector])
      delete row[vector]
      row.__vec = values ? vectors.push(values) - 1 : -1
    }
    console.log(` ${table}: ${rows.length} rows`)
    write(join(OUT, 'tables', `${table}.json.gz`), gz(rows))
    if (vector) {
      const dim = vectors[0]?.length ?? 0
      const buffer = new Float32Array(vectors.length * dim)
      vectors.forEach((v, i) => buffer.set(v, i * dim))
      write(join(OUT, 'vectors', `${table}.f32`), Buffer.from(buffer.buffer))
      write(join(OUT, 'vectors', `${table}.json`), JSON.stringify({ dim, count: vectors.length }))
    }
  }

  const users = [await userIdByEmail(required('DEMO_USER_EMAIL')), await userIdByEmail(required('DEMO_HOTELIER_EMAIL'))]
  const inUsers = `in.(${users.join(',')})`
  let conversations: string[] = []
  for (const { table, order, by } of DEMO_TABLES) {
    const filter =
      by === 'conversation'
        ? `&conversation_id=in.(${conversations.join(',') || '00000000-0000-0000-0000-000000000000'})`
        : `&${by}=${inUsers}`
    const rows = await readAll(table, order, filter)
    if (table === 'hotelier_conversations') conversations = rows.map((r) => String(r.id))
    console.log(` ${table}: ${rows.length} demo rows`)
    write(join(OUT, 'tables', `${table}.json.gz`), gz(rows))
  }
  write(join(OUT, 'demo.json'), JSON.stringify({ traveller: users[0], hotelier: users[1] }, null, 2) + '\n')
}

/**
 * The `stable` functions the proxy forwards (each checked in its migration): they cannot write. Everything else, and
 * every request but GET, is refused.
 */
const READ_FUNCTIONS = new Set([
  'hotel_view_eyes',
  'osm_places_near',
  'osm_places_near_facade',
  'osm_places_named',
  'hotel_geo_features',
  'hotel_noise_quiet',
  'hotel_noise_day',
  'hotel_noise_map',
  'hotel_noise_facade',
  'hotel_sea_distances',
  'hotels_outside_noise',
])

const body = (request: IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (c: Buffer) => chunks.push(c))
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })

/** The recording proxy: forwards the reads, keeps the answers of the functions. */
function startProxy(port: number, calls: Map<string, unknown>) {
  let refused = 0
  let failed = 0
  const server = createServer(async (request, response) => {
    const path = request.url ?? '/'
    const fn = /^\/rest\/v1\/rpc\/([a-z_]+)(\?.*)?$/.exec(path)?.[1]
    const allowed =
      request.method === 'GET' ||
      request.method === 'HEAD' ||
      (request.method === 'POST' && fn && READ_FUNCTIONS.has(fn))
    if (!allowed || path.startsWith('/auth/') || path.startsWith('/storage/') || path.startsWith('/realtime/')) {
      refused += 1
      response.writeHead(403, { 'content-type': 'application/json' }).end('{"message":"standalone export: read only"}')
      return
    }
    const payload = await body(request)
    const forward: Record<string, string> = {}
    for (const [k, v] of Object.entries(request.headers))
      if (typeof v === 'string' && !['host', 'connection', 'content-length', 'accept-encoding'].includes(k))
        forward[k] = v
    // The functions run with the service role: the anon's 3 s statement timeout cuts the dearest views short. They
    // are `stable` and read the public geodata only, so the answers are the anon's.
    if (fn) {
      delete forward.apikey
      delete forward.authorization
      Object.assign(forward, headers)
    }
    const upstream = await fetch(`${url}${path}`, {
      method: request.method,
      headers: forward,
      body: request.method === 'POST' ? payload : undefined,
    })
    const text = await upstream.text()
    // `hotels_outside_noise` outlasts the anon role's timeout every time: `exportOutsideNoise` reads it by psql.
    if (!upstream.ok && fn !== 'hotels_outside_noise') failed += 1
    if (fn && request.method === 'POST' && upstream.ok && !/[?&](limit|offset)=/.test(path) && !request.headers.range) {
      const args = payload.length ? JSON.parse(payload.toString()) : {}
      calls.set(callKey(fn, args), JSON.parse(text))
    } else if (fn && request.method === 'POST' && upstream.ok) {
      // A paged call (`hotel_sea_distances` read in pages): kept whole under the name alone, the pages joined.
      const rows = JSON.parse(text) as unknown[]
      const key = callKey(fn, {})
      calls.set(key, [...((calls.get(key) as unknown[]) ?? []), ...rows])
    }
    const out: Record<string, string> = { 'content-type': upstream.headers.get('content-type') ?? 'application/json' }
    const range = upstream.headers.get('content-range')
    if (range) out['content-range'] = range
    response.writeHead(upstream.status, out).end(text)
  })
  server.listen(port)
  return { server, refused: () => refused, failed: () => failed }
}

async function waitFor(target: string, timeoutMs: number) {
  const start = Date.now()
  for (;;) {
    try {
      const response = await fetch(target)
      if (response.status < 500) return
    } catch {}
    if (Date.now() - start > timeoutMs) throw new Error(`${target} did not start`)
    await new Promise((r) => setTimeout(r, 1000))
  }
}

const PROXY_PORT = 54399
const APP_PORT = 3999

/** A local `next dev` with Supabase behind the proxy; the caller kills it. */
async function startApp(): Promise<ChildProcess> {
  rmSync(join(APP, '.next'), { recursive: true, force: true })
  const app = spawn('npx', ['next', 'dev', '-p', String(APP_PORT)], {
    cwd: APP,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${PROXY_PORT}`,
      // Эвал's models are not asked: the crawl reads pages and routes only.
      NVIDIA_API_KEY: '',
      GIGACHAT_AUTH_KEY: '',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
    detached: true,
  })
  await waitFor(`http://127.0.0.1:${APP_PORT}/health`, 180_000)
  return app
}

/**
 * The functions of the whole catalogue without arguments (`hotels_outside_noise`, `hotel_sea_distances`), read alone
 * with the service role's longer timeout: under the crawl they outlast the anon's. Their pages are joined.
 */
const CATALOG_FUNCTIONS = ['hotels_outside_noise', 'hotel_sea_distances'] as const

async function serviceCall(name: string): Promise<unknown[]> {
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    let page: unknown[] | null = null
    for (let attempt = 1; !page; attempt += 1) {
      const response = await fetch(`${url}/rest/v1/rpc/${name}?offset=${from}&limit=${PAGE}`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: '{}',
      })
      if (response.ok) page = (await response.json()) as unknown[]
      else if (attempt === 3) throw new Error(`${name}: ${response.status}`)
      else await new Promise((r) => setTimeout(r, 5000))
    }
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

/** Adds the catalogue's functions to the recorded calls of data/standalone/rpc.json.gz. */
async function exportCatalogCalls(calls?: Map<string, unknown>) {
  const { existsSync, readFileSync } = process.getBuiltinModule('node:fs')
  const { gunzipSync } = process.getBuiltinModule('node:zlib')
  const file = join(OUT, 'rpc.json.gz')
  const kept =
    calls ?? new Map(existsSync(file) ? Object.entries(JSON.parse(gunzipSync(readFileSync(file)).toString())) : [])
  for (const name of CATALOG_FUNCTIONS) {
    const rows = await serviceCall(name)
    console.log(` ${name}: ${rows.length} rows`)
    kept.set(callKey(name, {}), rows)
  }
  if (!calls) write(file, gz(Object.fromEntries(kept)))
}

async function realHotels(): Promise<{ id: string; lat: number; lon: number }[]> {
  const response = await fetch(`${url}/rest/v1/hotels?select=id,lat,lon&id=like.ota-*&order=id`, { headers })
  if (!response.ok) throw new Error(`hotels: ${response.status}`)
  return (await response.json()) as { id: string; lat: number; lon: number }[]
}

/** Opens the pages and routes of every real hotel and the catalogue's pages; returns what the routes answered. */
async function crawl(hotels: readonly { id: string }[], routes: readonly string[], failed: () => number) {
  const base = `http://127.0.0.1:${APP_PORT}`
  const answers = new Map<string, unknown>()
  const get = async (path: string) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${base}${path}`).catch(() => null)
      if (response && response.status < 500) return response
      await new Promise((r) => setTimeout(r, 2000))
    }
    throw new Error(`${path} failed`)
  }
  for (const path of ['/', '/search', '/api/hotels']) await get(path)
  // One hotel at a time: three at once outlast the anon role's statement timeout. A hotel whose calls failed is
  // opened again (a failed read is not cached by the app), up to `ATTEMPTS` times.
  const ATTEMPTS = 5
  let done = 0
  let unfinished = 0
  for (const hotel of hotels) {
    for (let attempt = 1; ; attempt += 1) {
      const before = failed()
      await (await get(`/hotels/${hotel.id}`)).text()
      for (const route of routes) {
        const response = await get(`/api/hotels/${hotel.id}/${route}`)
        if (response.ok) answers.set(`${hotel.id} ${route}`, await response.json())
      }
      if (failed() === before) break
      if (attempt === ATTEMPTS) {
        unfinished += 1
        console.log(`  ${hotel.id}: calls still fail after ${ATTEMPTS} attempts`)
        break
      }
      await new Promise((r) => setTimeout(r, 3000))
    }
    done += 1
    if (done % 20 === 0) console.log(`  ${done}/${hotels.length}`)
  }
  console.log(` ${unfinished} hotels with failed calls`)
  return answers
}

const MAP_ROUTES = ['noise-map', 'view-map']

async function exportRpc(withMaps: boolean, withRpc: boolean) {
  console.log('rpc: the app behind the recording proxy')
  const calls = new Map<string, unknown>()
  const proxy = startProxy(PROXY_PORT, calls)
  const app = await startApp()
  try {
    const hotels = await realHotels()
    const answers = await crawl(hotels, ['view', ...(withMaps ? MAP_ROUTES : [])], proxy.failed)
    console.log(` ${calls.size} calls recorded, ${proxy.refused()} requests refused`)
    if (withRpc) {
      await exportCatalogCalls(calls)
      // The map functions are kept as static files by `writeMaps`, not in the bundle.
      const kept = [...calls].filter(
        ([key]) => !/^(hotel_geo_features|hotel_noise_map|hotel_noise_quiet|hotel_noise_day) /.test(key),
      )
      const counts = new Map<string, number>()
      for (const [key] of kept) counts.set(key.split(' ')[0], (counts.get(key.split(' ')[0]) ?? 0) + 1)
      console.log(` ${[...counts].map(([k, n]) => `${k} ${n}`).join(', ')}`)
      write(join(OUT, 'rpc.json.gz'), gz(Object.fromEntries(kept)))
    }
    if (withMaps) writeMaps(hotels, answers)
  } finally {
    if (app.pid) process.kill(-app.pid, 'SIGTERM')
    proxy.server.close()
    rmSync(join(APP, '.next'), { recursive: true, force: true })
  }
}

/** Tile size of the shared map tiles, degrees (~550 m at Valencia's latitude). */
const TILE_DEG = 0.005

interface Feature {
  type: 'Feature'
  geometry: { type: string; coordinates: unknown }
  properties: Record<string, unknown>
}

/** Degrees a point may move when a line is simplified: ~1.5 m, below the 5-decimal rounding's ~1 m twice. */
const SIMPLIFY_DEG = 1.5e-5

/** Douglas–Peucker of an open line of [lon, lat]. */
function simplifyLine(points: number[][], tolerance: number): number[][] {
  if (points.length <= 2) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = points[a]
    const [bx, by] = points[b]
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy)
    let worst = -1
    let at = -1
    for (let i = a + 1; i < b; i += 1) {
      const [px, py] = points[i]
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len
      if (d > worst) {
        worst = d
        at = i
      }
    }
    if (worst > tolerance) {
      keep[at] = 1
      stack.push([a, at], [at, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

/**
 * A ring without its repeated points, simplified. A ring the simplification would break (fewer than 4 points left)
 * keeps its distinct points, and a ring the 5-decimal rounding already flattened stays as it was: no shape of the
 * route's answer is lost.
 */
function simplifyRing(ring: number[][]): number[][] {
  const distinct = ring.filter((p, i) => i === 0 || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1])
  if (distinct.length < 4) return ring
  const simple = simplifyLine(distinct, SIMPLIFY_DEG)
  return simple.length < 4 ? distinct : simple
}

/** The polygons of a feature simplified, every ring kept. */
function simplifyFeature(feature: Feature): Feature {
  const { type, coordinates } = feature.geometry
  const polygon = (rings: number[][][]) => rings.map(simplifyRing)
  if (type === 'Polygon') return { ...feature, geometry: { type, coordinates: polygon(coordinates as number[][][]) } }
  if (type === 'MultiPolygon')
    return { ...feature, geometry: { type, coordinates: (coordinates as number[][][][]).map(polygon) } }
  return feature
}

const firstPoint = (coordinates: unknown): [number, number] => {
  let c = coordinates
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  return c as [number, number]
}

/**
 * The maps as static files. A feature (a building, a noise band, a quiet or a day piece) is often in the maps of
 * several hotels: it goes once into the tile of its first point (`tiles/<x>_<y>.json`, keyed by its hash), and a
 * hotel's file (`hotels/<id>.json`) lists, per layer, the tiles and the hashes of its features plus what is not
 * a feature (the map's own fields). `src/lib/standalone/maps.ts` puts a hotel's map back together.
 */
function writeMaps(hotels: readonly { id: string }[], answers: Map<string, unknown>) {
  rmSync(join(PUBLIC_OUT, 'maps'), { recursive: true, force: true })
  const tiles = new Map<string, Map<string, Feature>>()
  const hashOf = (feature: Feature) =>
    createHash('sha1').update(JSON.stringify(feature)).digest('base64url').slice(0, 12)
  /** The map with each array of features replaced by the list of their hashes, tile by tile. */
  const index = (value: unknown): unknown => {
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((f) => f && (f as Feature).type === 'Feature' && (f as Feature).geometry)
    ) {
      return {
        __features: (value as Feature[]).flatMap((original) => {
          const feature = simplifyFeature(original)
          const [lon, lat] = firstPoint(feature.geometry.coordinates)
          const tile = `${Math.floor(lon / TILE_DEG)}_${Math.floor(lat / TILE_DEG)}`
          const hash = hashOf(feature)
          if (!tiles.has(tile)) tiles.set(tile, new Map())
          tiles.get(tile)!.set(hash, feature)
          return [`${tile}/${hash}`]
        }),
      }
    }
    if (Array.isArray(value)) return value.map(index)
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, index(v)]))
    return value
  }
  let raw = 0
  for (const hotel of hotels) {
    const maps: Record<string, unknown> = {}
    for (const route of MAP_ROUTES) {
      const answer = answers.get(`${hotel.id} ${route}`)
      if (answer === undefined) continue
      raw += JSON.stringify(answer).length
      maps[route] = index(answer)
    }
    if (Object.keys(maps).length === 0) continue
    mkdirSync(join(PUBLIC_OUT, 'maps/hotels'), { recursive: true })
    writeFileSync(join(PUBLIC_OUT, 'maps/hotels', `${hotel.id}.json.gz`), gz(maps))
  }
  mkdirSync(join(PUBLIC_OUT, 'maps/tiles'), { recursive: true })
  let size = 0
  let packed = 0
  for (const [tile, features] of tiles) {
    const text = JSON.stringify(Object.fromEntries(features))
    const data = gzipSync(text, { level: 9 })
    size += text.length
    packed += data.length
    writeFileSync(join(PUBLIC_OUT, 'maps/tiles', `${tile}.json.gz`), data)
  }
  console.log(
    ` maps: ${(raw / 1e6).toFixed(1)} MB as the routes give them, ${(size / 1e6).toFixed(1)} MB of ${tiles.size} tiles` +
      ` simplified, ${(packed / 1e6).toFixed(1)} MB gzipped`,
  )
}

/**
 * What the browser starts from (`data/standalone/browser.json`, bundled by src/lib/standalone/browser.ts): the demo
 * accounts and their rows, and every hotel's name only (the hotelier's list names the hotels).
 */
function exportBrowser() {
  const { gunzipSync } = process.getBuiltinModule('node:zlib')
  const { readFileSync } = process.getBuiltinModule('node:fs')
  const read = (table: string) =>
    JSON.parse(gunzipSync(readFileSync(join(OUT, 'tables', `${table}.json.gz`))).toString()) as Record<
      string,
      unknown
    >[]
  const ids = JSON.parse(readFileSync(join(OUT, 'demo.json'), 'utf8')) as Record<'traveller' | 'hotelier', string>
  const profiles = read('profiles')
  const nameOf = (id: string) => String(profiles.find((p) => p.id === id)?.name ?? '')
  const tables: Record<string, unknown[]> = {
    hotels: read('hotels').map((h) => ({ id: h.id, data: { name: (h.data as { name?: string }).name ?? null } })),
    hotelier_hotel_access: [],
  }
  for (const { table } of DEMO_TABLES) tables[table] = read(table)
  const browser = {
    accounts: {
      traveller: { id: ids.traveller, name: nameOf(ids.traveller) },
      hotelier: { id: ids.hotelier, name: nameOf(ids.hotelier) },
    },
    tables,
  }
  console.log('browser')
  write(join(OUT, 'browser.json'), JSON.stringify(browser))
}

/** The maps as the routes gave them, put back together from the files of `writeMaps` (to write them again). */
function readMaps(): { hotels: { id: string }[]; answers: Map<string, unknown> } {
  const { existsSync, readFileSync, readdirSync } = process.getBuiltinModule('node:fs')
  const { gunzipSync } = process.getBuiltinModule('node:zlib')
  const readJson = (path: string) =>
    existsSync(`${path}.gz`)
      ? JSON.parse(gunzipSync(readFileSync(`${path}.gz`)).toString())
      : JSON.parse(readFileSync(path, 'utf8'))
  const dir = join(PUBLIC_OUT, 'maps')
  const tileCache = new Map<string, Record<string, Feature>>()
  const tileOf = (id: string) => {
    if (!tileCache.has(id)) tileCache.set(id, readJson(join(dir, 'tiles', `${id}.json`)))
    return tileCache.get(id)!
  }
  const rebuild = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rebuild)
    if (!value || typeof value !== 'object') return value
    const refs = (value as { __features?: string[] }).__features
    if (refs) return refs.map((ref) => tileOf(ref.split('/')[0])[ref.split('/')[1]])
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rebuild(v)]))
  }
  const hotels: { id: string }[] = []
  const answers = new Map<string, unknown>()
  for (const file of readdirSync(join(dir, 'hotels')).sort()) {
    const id = file.replace(/\.json(\.gz)?$/, '')
    hotels.push({ id })
    const maps = readJson(join(dir, 'hotels', `${id}.json`)) as Record<string, unknown>
    for (const [route, answer] of Object.entries(maps)) answers.set(`${id} ${route}`, rebuild(answer))
  }
  return { hotels, answers }
}

if (options.catalog) await exportCatalogCalls()
if (options.remap) {
  const { hotels, answers } = readMaps()
  writeMaps(hotels, answers)
}
if (all || options.tables) await exportTables()
if (all || options.tables || options.browser) exportBrowser()
if (all || options.rpc || options.maps) await exportRpc(all || options.maps, all || options.rpc)
console.log('done')
