import type { User } from '@supabase/supabase-js'
import { nameFromEmail } from './auth'
import type { ExternalStore } from './storage'
import { getBrowserClient } from './supabase/client'

/** The signed-in user as the interface shows it. */
export interface Session {
  name: string
  email: string
}

/**
 * The Supabase session of this browser, kept in memory and followed through `onAuthStateChange` (the session
 * itself lives in Supabase's cookies). Empty during prerender and hydration, and always without Supabase settings.
 */
let current: Session | null = null
let userId: string | null = null
let started = false
const listeners = new Set<() => void>()

function set(next: Session | null) {
  current = next
  listeners.forEach((listener) => listener())
}

/** The name from the profile, then from the sign-up data, then from the email. */
async function toSession(user: User): Promise<Session> {
  const email = user.email ?? ''
  const { data } = (await getBrowserClient()?.from('profiles').select('name').eq('id', user.id).maybeSingle()) ?? {}
  const metaName = typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : ''
  return { email, name: data?.name?.trim() || metaName.trim() || nameFromEmail(email) }
}

async function apply(user: User | null) {
  if ((user?.id ?? null) === userId) return
  userId = user?.id ?? null
  if (!user) return set(null)
  const session = await toSession(user)
  // A sign-out or another account while the profile loaded wins.
  if (userId === user.id) set(session)
}

function start() {
  if (started) return
  started = true
  // Supabase runs the callback under its auth lock: further calls must wait until it has returned.
  getBrowserClient()?.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => void apply(session?.user ?? null))
  })
}

export const sessionStore: ExternalStore<Session | null> & { set(next: Session | null): void } = {
  get: () => current,
  getServerSnapshot: () => null,
  set(next) {
    userId = null
    set(next)
  },
  subscribe(listener) {
    start()
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

/** Picks up a session set by the server (the demo sign-in): Supabase reports no event for cookies it did not write. */
export async function reloadSession() {
  const { data } = (await getBrowserClient()?.auth.getSession()) ?? {}
  await apply(data?.session?.user ?? null)
}

/** Ends the session in this browser only (other visitors share the demo account); favorites and bookings stay. */
export async function signOut() {
  sessionStore.set(null)
  await getBrowserClient()?.auth.signOut({ scope: 'local' })
}
