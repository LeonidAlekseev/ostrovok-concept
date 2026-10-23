import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const auth = vi.hoisted(() => ({
  configured: true,
  exchangeCodeForSession: vi.fn(async (): Promise<{ error: object | null }> => ({ error: null })),
  verifyOtp: vi.fn(async (): Promise<{ error: object | null }> => ({ error: null })),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => (auth.configured ? { auth } : null) }))

const open = async (query: string) => {
  const response = await GET(new NextRequest(`https://opognali.test/auth/callback?${query}`))
  return response.headers.get('location')
}

beforeEach(() => {
  auth.configured = true
  vi.clearAllMocks()
})

describe('/auth/callback', () => {
  it('exchanges the code and opens an internal `next`', async () => {
    expect(await open('code=abc&next=%2Ftrips')).toBe('https://opognali.test/trips')
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc')
  })

  it('verifies a token hash and opens / for an external `next`', async () => {
    expect(await open('token_hash=t&type=email&next=%2F%2Fevil.com')).toBe('https://opognali.test/')
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 't', type: 'email' })
  })

  it('sends a used link back to the sign-in form', async () => {
    auth.exchangeCodeForSession.mockResolvedValueOnce({ error: {} })
    expect(await open('code=used&next=%2Ftrips')).toBe('https://opognali.test/login?error=link&next=%2Ftrips')
  })

  it('treats a link without a code or without Supabase settings as failed', async () => {
    expect(await open('')).toBe('https://opognali.test/login?error=link&next=%2F')
    auth.configured = false
    expect(await open('code=abc')).toBe('https://opognali.test/login?error=link&next=%2F')
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })
})
