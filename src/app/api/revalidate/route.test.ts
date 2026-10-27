import { revalidateTag } from 'next/cache'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), unstable_cache: <T>(read: T) => read }))
vi.mock('@/lib/secrets', () => ({
  getSecret: async (name: string) => (name === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service' : undefined),
}))

const post = (authorization?: string) =>
  POST(
    new Request('http://localhost/api/revalidate', { method: 'POST', headers: authorization ? { authorization } : {} }),
  )

beforeEach(() => vi.mocked(revalidateTag).mockClear())

describe('POST /api/revalidate', () => {
  it('drops the cached catalogue for the bearer of the service key', async () => {
    const response = await post('Bearer service')
    expect(response.status).toBe(200)
    expect(revalidateTag).toHaveBeenCalledWith('catalog', { expire: 0 })
    expect(revalidateTag).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['no key', undefined],
    ['another key', 'Bearer servic3'],
    ['a key of another length', 'Bearer s'],
  ])('refuses %s', async (_, authorization) => {
    expect((await post(authorization)).status).toBe(403)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
