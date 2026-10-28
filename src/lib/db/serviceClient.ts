import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSecret } from '../secrets'
import { isSupabaseConfigured, supabaseUrl } from '../supabase/config'
import type { Database } from './database.types'

/** How long the service role key may take to be read; later the caller works without it, as without the key. */
export const SERVICE_KEY_TIMEOUT_MS = 3000

let service: Promise<SupabaseClient<Database> | null> | undefined

async function create(): Promise<SupabaseClient<Database> | null> {
  if (!isSupabaseConfigured) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  const key = await Promise.race([
    getSecret('SUPABASE_SERVICE_ROLE_KEY').catch(() => undefined),
    new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), SERVICE_KEY_TIMEOUT_MS))),
  ]).finally(() => clearTimeout(timer))
  // A key that did not come in time is asked for again by the next call; a missing key is final.
  if (key === null) {
    service = undefined
    return null
  }
  return key
    ? createClient<Database>(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null
}

/**
 * The one client with the service role key, shared by the server's code that writes what no user may (the places
 * cache, the rate limit counter, the hotelier knowledge); `null` without Supabase or the key. The key never leaves the
 * server: this module is `server-only`.
 */
export function serviceClient(): Promise<SupabaseClient<Database> | null> {
  service ??= create()
  return service
}
