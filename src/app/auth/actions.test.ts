import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signInDemo } from './actions'

const mocks = vi.hoisted(() => ({
  configured: true,
  secrets: {} as Record<string, string | undefined>,
  signInWithPassword: vi.fn(async (): Promise<{ error: object | null }> => ({ error: null })),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => (mocks.configured ? { auth: { signInWithPassword: mocks.signInWithPassword } } : null),
}))
vi.mock('@/lib/secrets', () => ({ getSecret: async (name: string) => mocks.secrets[name] }))
const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect ${url}`)
  }),
}))
vi.mock('next/navigation', () => ({ redirect: nav.redirect }))

beforeEach(() => {
  mocks.configured = true
  mocks.secrets = { DEMO_USER_EMAIL: 'demo@example.com', DEMO_USER_PASSWORD: 'demo-password' }
  vi.clearAllMocks()
})

describe('signInDemo', () => {
  it('signs in with the demo account from the server secrets', async () => {
    expect(await signInDemo()).toEqual({})
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'demo@example.com', password: 'demo-password' })
  })

  it('is unavailable without Supabase or the demo account', async () => {
    mocks.secrets = {}
    expect(await signInDemo()).toEqual({ error: 'Вход временно недоступен' })
    mocks.secrets = { DEMO_USER_EMAIL: 'demo@example.com', DEMO_USER_PASSWORD: 'demo-password' }
    mocks.configured = false
    expect(await signInDemo()).toEqual({ error: 'Вход временно недоступен' })
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
  })

  it('opens an internal `next` itself, so no navigation of the browser races the new cookies', async () => {
    await expect(signInDemo('/trips/booking?id=OS-UP0001')).rejects.toThrow('redirect /trips/booking?id=OS-UP0001')
    // An external address goes home, as the client does.
    await expect(signInDemo('//evil.com')).rejects.toThrow('redirect /')
    expect(nav.redirect).toHaveBeenLastCalledWith('/')
  })

  it('signs in to the demo hotelier and opens the panel, whatever the `next`', async () => {
    mocks.secrets = { DEMO_HOTELIER_EMAIL: 'hotelier@example.com', DEMO_HOTELIER_PASSWORD: 'hotelier-password' }
    await expect(signInDemo('/trips', 'hotelier')).rejects.toThrow('redirect /hotelier')
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'hotelier@example.com',
      password: 'hotelier-password',
    })
  })

  it('is unavailable without the hotelier account, never falling back to the traveller', async () => {
    expect(await signInDemo(null, 'hotelier')).toEqual({ error: 'Вход временно недоступен' })
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
  })

  it('reports a failed sign-in without details', async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } })
    expect(await signInDemo()).toEqual({ error: 'Не удалось войти в демо-аккаунт, попробуйте ещё раз' })
  })
})
