'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { resolveNext } from '@/lib/auth'
import { DEMO_COOKIE } from '@/lib/standalone/client'

/** The shared demo accounts: the traveller's, and the hotelier's of every hotel. */
export type DemoAccount = 'traveller' | 'hotelier'

/** The hotelier's demo account opens their panel, whatever page the sign-in was on. */
const HOTELIER_HOME = '/hotelier'

/** A month: the demo stays signed in in this browser until it signs out. */
const DEMO_COOKIE_SECONDS = 60 * 60 * 24 * 30

/**
 * Signs in to a demo account of the standalone demo: no password, the account is a cookie the browser's code reads
 * too (src/lib/standalone/client.ts). With `next` (and always for the hotelier, to `/hotelier`) the action opens the
 * page itself: a navigation of the browser right after the action set the cookie races Next's re-render of the page
 * and may be dropped.
 */
export async function signInDemo(
  next?: string | null,
  account: DemoAccount = 'traveller',
): Promise<{ error?: string }> {
  const chosen: DemoAccount = account === 'hotelier' ? 'hotelier' : 'traveller'
  ;(await cookies()).set(DEMO_COOKIE, chosen, {
    path: '/',
    maxAge: DEMO_COOKIE_SECONDS,
    sameSite: 'lax',
    httpOnly: false,
  })
  const target = chosen === 'hotelier' ? HOTELIER_HOME : resolveNext(next)
  if (target) redirect(target)
  return {}
}
