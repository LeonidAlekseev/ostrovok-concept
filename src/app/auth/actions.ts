'use server'

import { redirect } from 'next/navigation'
import { resolveNext } from '@/lib/auth'
import { getSecret } from '@/lib/secrets'
import { AUTH_UNAVAILABLE } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'

/** The shared demo accounts: the traveller's, and the hotelier's of every hotel (`npm run db:hotelier`). */
export type DemoAccount = 'traveller' | 'hotelier'

const DEMO_SECRETS: Record<DemoAccount, [email: string, password: string]> = {
  traveller: ['DEMO_USER_EMAIL', 'DEMO_USER_PASSWORD'],
  hotelier: ['DEMO_HOTELIER_EMAIL', 'DEMO_HOTELIER_PASSWORD'],
}

/** The hotelier's demo account opens their panel, whatever page the sign-in was on. */
const HOTELIER_HOME = '/hotelier'

/**
 * Signs in to a shared demo account: its password stays on the server. `error` is shown to the user. With
 * `next` (and always for the hotelier, to `/hotelier`) the action opens the page itself: a navigation of the browser
 * right after the action set the cookies races Next's re-render of the page and may be dropped.
 */
export async function signInDemo(
  next?: string | null,
  account: DemoAccount = 'traveller',
): Promise<{ error?: string }> {
  const [emailName, passwordName] = DEMO_SECRETS[account] ?? DEMO_SECRETS.traveller
  const [supabase, email, password] = await Promise.all([createClient(), getSecret(emailName), getSecret(passwordName)])
  if (!supabase || !email || !password) return { error: AUTH_UNAVAILABLE }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'Не удалось войти в демо-аккаунт, попробуйте ещё раз' }
  const target = account === 'hotelier' ? HOTELIER_HOME : resolveNext(next)
  if (target) redirect(target)
  return {}
}
