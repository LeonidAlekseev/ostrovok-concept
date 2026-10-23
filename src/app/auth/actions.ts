'use server'

import { redirect } from 'next/navigation'
import { resolveNext } from '@/lib/auth'
import { getSecret } from '@/lib/secrets'
import { AUTH_UNAVAILABLE } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'

/**
 * Signs in to the shared demo account: its password stays on the server. `error` is shown to the user. With
 * `next` the action opens it itself: a navigation of the browser right after the action set the cookies races
 * Next's re-render of the page and may be dropped.
 */
export async function signInDemo(next?: string | null): Promise<{ error?: string }> {
  const [supabase, email, password] = await Promise.all([
    createClient(),
    getSecret('DEMO_USER_EMAIL'),
    getSecret('DEMO_USER_PASSWORD'),
  ])
  if (!supabase || !email || !password) return { error: AUTH_UNAVAILABLE }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'Не удалось войти в демо-аккаунт, попробуйте ещё раз' }
  const target = resolveNext(next)
  if (target) redirect(target)
  return {}
}
