import { beforeEach, describe, expect, it, vi } from 'vitest'
import { processDueHotelierKnowledge } from '@/lib/db/hotelierKnowledge'
import { POST } from './route'

vi.mock('@/lib/db/hotelierKnowledge', () => ({ processDueHotelierKnowledge: vi.fn(async () => 2) }))
vi.mock('@/lib/secrets', () => ({
  getSecret: async (name: string) => (name === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service' : undefined),
}))

const post = (authorization?: string) =>
  POST(
    new Request('http://localhost/api/hotelier/knowledge/retry', {
      method: 'POST',
      headers: authorization ? { authorization } : {},
    }),
  )

beforeEach(() => vi.mocked(processDueHotelierKnowledge).mockClear())

describe('POST /api/hotelier/knowledge/retry', () => {
  it('processes the due answers for the bearer of the service key', async () => {
    const response = await post('Bearer service')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ processed: 2 })
    expect(processDueHotelierKnowledge).toHaveBeenCalledWith(5)
  })

  it.each([
    ['no key', undefined],
    ['another key', 'Bearer servic3'],
  ])('refuses %s', async (_, authorization) => {
    expect((await post(authorization)).status).toBe(403)
    expect(processDueHotelierKnowledge).not.toHaveBeenCalled()
  })
})
