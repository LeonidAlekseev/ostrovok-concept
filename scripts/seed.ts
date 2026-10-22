// Loads the catalog generator's destinations and hotels and the seed routes into Supabase and prepares the demo account.
//   npm run db:seed   (Node runs the TypeScript itself; the keys come from .env.local, see README «Ключи API»)
// Upserts by id, so a second run leaves the same rows. Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// DEMO_USER_EMAIL and DEMO_USER_PASSWORD; prints counts, never the keys.
import { registerHooks } from 'node:module'
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
const { buildCatalog } = await import('../src/lib/catalog.ts')
const { seedRoutes } = await import('../src/data/routes.ts')
const { parseRoute } = await import('../src/lib/routes.ts')

const BATCH = 100
const DEMO_NAME = 'Демо-путешественник'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set: run npm run secrets:reveal`)
  return value
}

const supabase = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function upsert(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + BATCH), { onConflict: 'id' })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true })
  if (error) throw new Error(`${table}: ${error.message}`)
  console.log(`${table}: ${rows.length} upserted, ${count} in the table`)
}

const updatedAt = new Date().toISOString()
await upsert(
  'destinations',
  destinations.map((destination) => ({ id: destination.id, data: destination, updated_at: updatedAt })),
)
const catalog = buildCatalog()
await upsert(
  'hotels',
  catalog.map((hotel) => ({
    id: hotel.id,
    destination_id: hotel.destinationId,
    stars: hotel.stars,
    rating: hotel.rating,
    price_from: hotel.priceFrom,
    lat: hotel.lat,
    lon: hotel.lon,
    data: hotel,
    updated_at: updatedAt,
  })),
)
// Every stop's hotel must be in the catalog: parseRoute throws otherwise, before the routes are written.
const hotelIds = new Set(catalog.map((hotel) => hotel.id))
await upsert(
  'routes',
  seedRoutes
    .map((route) => parseRoute(route, (id) => hotelIds.has(id)))
    .map((route) => ({
      id: route.id,
      persona: route.persona,
      destination_id: route.destinationId,
      featured: false,
      data: route,
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
