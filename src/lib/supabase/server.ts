import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/database.types'
import { userStandaloneClient } from '@/lib/standalone/server'

/** The client of a request, route handler or server action: the demo account of its cookie, over the snapshot. */
export async function createClient(): Promise<SupabaseClient<Database>> {
  return (await userStandaloneClient()) as unknown as SupabaseClient<Database>
}
