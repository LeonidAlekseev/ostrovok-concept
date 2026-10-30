import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/database.types'
import { browserClient } from '@/lib/standalone/browser'

/**
 * The browser client of the standalone demo: the snapshot's demo chats under this browser's own rows
 * (src/lib/standalone/browser.ts), with the interface of Supabase's; `null` only during prerender.
 */
export function getBrowserClient(): SupabaseClient<Database> | null {
  if (typeof window === 'undefined') return null
  return browserClient() as unknown as SupabaseClient<Database>
}
