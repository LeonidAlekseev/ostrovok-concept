import { beforeEach, describe, expect, it, vi } from 'vitest'

type AuthCallback = (event: string, session: { user: object } | null) => void

const supabase = vi.hoisted(() => {
  const state = { callback: undefined as AuthCallback | undefined, profileName: null as string | null }
  const client = {
    auth: {
      onAuthStateChange: vi.fn((callback: AuthCallback) => {
        state.callback = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      getSession: vi.fn(),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: state.profileName } }) }) }),
    })),
  }
  return { state, client, configured: true }
})
vi.mock('./supabase/client', () => ({ getBrowserClient: () => (supabase.configured ? supabase.client : null) }))

const anna = { id: 'u1', email: 'anna@example.com', user_metadata: { name: 'Анна' } }

async function load() {
  vi.resetModules()
  return import('./session')
}

/** Waits for the deferred `onAuthStateChange` handling and the profile request. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.clearAllMocks()
  supabase.configured = true
  supabase.state.callback = undefined
  supabase.state.profileName = null
})

describe('session', () => {
  it('is empty on the server and before Supabase reports a session', async () => {
    const { sessionStore } = await load()
    expect(sessionStore.getServerSnapshot()).toBeNull()
    expect(sessionStore.get()).toBeNull()
  })

  it('follows Supabase once subscribed, the name from the profile first', async () => {
    const { sessionStore } = await load()
    const listener = vi.fn()
    sessionStore.subscribe(listener)
    expect(supabase.client.auth.onAuthStateChange).toHaveBeenCalledTimes(1)

    supabase.state.profileName = 'Анна Петрова'
    supabase.state.callback!('INITIAL_SESSION', { user: anna })
    await settle()
    expect(sessionStore.get()).toEqual({ name: 'Анна Петрова', email: 'anna@example.com' })
    expect(listener).toHaveBeenCalled()

    supabase.state.callback!('SIGNED_OUT', null)
    await settle()
    expect(sessionStore.get()).toBeNull()
  })

  it('falls back to the sign-up name, then to the email', async () => {
    const { sessionStore } = await load()
    sessionStore.subscribe(() => {})
    supabase.state.callback!('SIGNED_IN', { user: anna })
    await settle()
    expect(sessionStore.get()?.name).toBe('Анна')

    supabase.state.callback!('SIGNED_IN', { user: { id: 'u2', email: 'boris@example.com', user_metadata: {} } })
    await settle()
    expect(sessionStore.get()).toEqual({ name: 'boris', email: 'boris@example.com' })
  })

  it('picks up a session the server set', async () => {
    const { reloadSession, sessionStore } = await load()
    supabase.client.auth.getSession.mockResolvedValue({ data: { session: { user: anna } } })
    await reloadSession()
    expect(sessionStore.get()).toEqual({ name: 'Анна', email: 'anna@example.com' })
  })

  it('signs out in this browser only', async () => {
    const { signOut, sessionStore } = await load()
    sessionStore.set({ name: 'Анна', email: 'anna@example.com' })
    await signOut()
    expect(sessionStore.get()).toBeNull()
    expect(supabase.client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('stays empty without the Supabase settings', async () => {
    supabase.configured = false
    const { reloadSession, sessionStore, signOut } = await load()
    sessionStore.subscribe(() => {})
    await reloadSession()
    await signOut()
    expect(sessionStore.get()).toBeNull()
  })
})
