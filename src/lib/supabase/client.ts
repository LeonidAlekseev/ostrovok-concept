import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from './config'

/** The browser client (one per page, the session in cookies); `null` without the Supabase settings. */
export function getBrowserClient(): SupabaseClient | null {
  return isSupabaseConfigured ? createBrowserClient(supabaseUrl, supabaseAnonKey) : null
}
