import 'server-only'
import { loadSharedChat, type SharedChat } from '@/lib/assistantShare'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { anonClient } from './anon'

/** A shared chat by the id of its link, read with the anon key; `null` when there is none or it is unavailable. */
export async function loadShare(id: string): Promise<SharedChat | null> {
  if (!isSupabaseConfigured) return null
  return loadSharedChat(anonClient(), id).catch(() => null)
}
