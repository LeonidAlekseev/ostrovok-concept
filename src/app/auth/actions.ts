'use server'

import { getSecret } from '@/lib/secrets'
import { AUTH_UNAVAILABLE } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'

/** Signs in to the shared demo account: its password stays on the server. `error` is shown to the user. */
export async function signInDemo(): Promise<{ error?: string }> {
  const [supabase, email, password] = await Promise.all([
    createClient(),
    getSecret('DEMO_USER_EMAIL'),
    getSecret('DEMO_USER_PASSWORD'),
  ])
  if (!supabase || !email || !password) return { error: AUTH_UNAVAILABLE }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? { error: 'Не удалось войти в демо-аккаунт, попробуйте ещё раз' } : {}
}
