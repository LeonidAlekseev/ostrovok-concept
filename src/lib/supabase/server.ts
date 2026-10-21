import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from './config'

/** The client of a request, route handler or server action, with the session in its cookies; `null` without settings. */
export async function createClient() {
  if (!isSupabaseConfigured) return null
  const cookieStore = await cookies()
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        } catch {
          // A server component cannot set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  })
}
