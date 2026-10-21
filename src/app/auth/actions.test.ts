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

  it('reports a failed sign-in without details', async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } })
    expect(await signInDemo()).toEqual({ error: 'Не удалось войти в демо-аккаунт, попробуйте ещё раз' })
  })
})
