import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceStandaloneClient } from '../standalone/server'
import type { Database } from './database.types'

/** How long the service role key may take to be read; later the caller works without it, as without the key. */
export const SERVICE_KEY_TIMEOUT_MS = 3000

/**
 * The standalone demo's service role: its writes (the hotelier knowledge) go to the asking browser's rows
 * (src/lib/standalone/server.ts). Was: the one client with the service role key, shared by the server's code that writes what no user may (the places
 * cache, the rate limit counter, the hotelier knowledge); `null` without Supabase or the key. The key never leaves the
 * server: this module is `server-only`.
 */
export function serviceClient(): Promise<SupabaseClient<Database> | null> {
  return Promise.resolve(serviceStandaloneClient() as unknown as SupabaseClient<Database>)
}
