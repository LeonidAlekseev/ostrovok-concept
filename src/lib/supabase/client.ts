import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/database.types'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from './config'

/** The browser client (one per page, the session in cookies); `null` without the Supabase settings. */
export function getBrowserClient(): SupabaseClient<Database> | null {
  return isSupabaseConfigured ? createBrowserClient<Database>(supabaseUrl, supabaseAnonKey) : null
}
