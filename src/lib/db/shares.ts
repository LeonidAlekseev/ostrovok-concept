import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/database.types'
import { loadSharedChat, type SharedChat } from '@/lib/assistantShare'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'

/** A shared chat by the id of its link, read with the anon key; `null` when there is none or it is unavailable. */
export async function loadShare(id: string): Promise<SharedChat | null> {
  if (!isSupabaseConfigured) return null
  const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return loadSharedChat(client, id).catch(() => null)
}
