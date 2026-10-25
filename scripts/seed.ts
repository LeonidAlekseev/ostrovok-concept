// Loads the catalog generator's destinations and hotels into Supabase and prepares the demo account.
//   npm run db:seed   (Node runs the TypeScript itself; the keys come from .env.local, see README «Ключи API»)
//   npm run db:seed -- --revalidate https://<site>   then drops the site's cached catalogue (POST /api/revalidate)
// Upserts by id, so a second run leaves the same rows. Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// DEMO_USER_EMAIL and DEMO_USER_PASSWORD; prints counts, never the keys.
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

const { destinations } = await import('../src/data/destinations.ts')
const { buildCatalog } = await import('../src/lib/catalogGenerator.ts')

const { values: options } = parseArgs({ options: { revalidate: { type: 'string' } } })

const BATCH = 100
/** A table of the schema, for the helpers that take its name. */
type Table = keyof Database['public']['Tables']
const DEMO_NAME = 'Демо-путешественник'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set: run npm run secrets:reveal`)
  return value
}

const supabase = createClient<Database>(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function upsert(table: Table, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + BATCH) as never, { onConflict: 'id' })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true })
  if (error) throw new Error(`${table}: ${error.message}`)
  console.log(`${table}: ${rows.length} upserted, ${count} in the table`)
}

const updatedAt = new Date().toISOString()
await upsert(
  'destinations',
  destinations.map((destination, position) => ({
    id: destination.id,
    position,
    data: destination,
    updated_at: updatedAt,
  })),
)
const catalog = buildCatalog()
await upsert(
  'hotels',
  catalog.map((hotel, position) => ({
    id: hotel.id,
    position,
    destination_id: hotel.destinationId,
    stay_type: hotel.stayType,
    stars: hotel.stars,
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

const { error } = await supabase.auth.admin.createUser({
  email: required('DEMO_USER_EMAIL'),
  password: required('DEMO_USER_PASSWORD'),
  email_confirm: true,
  user_metadata: { name: DEMO_NAME },
})
if (error && error.code !== 'email_exists') throw new Error(`demo account: ${error.message}`)
console.log(error ? 'demo account: already exists' : 'demo account: created')

if (options.revalidate) {
  // The service key is the revalidation secret: only over https, or to a local server.
  const url = new URL('/api/revalidate', options.revalidate)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('--revalidate needs an https:// site')
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${required('SUPABASE_SERVICE_ROLE_KEY')}` },
  })
  if (!response.ok) throw new Error(`revalidate ${url.origin}: HTTP ${response.status}`)
  console.log(`catalog cache: revalidated on ${url.origin}`)
}
