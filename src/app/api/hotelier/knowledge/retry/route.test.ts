import { beforeEach, describe, expect, it, vi } from 'vitest'
import { processDueHotelierKnowledge } from '@/lib/db/hotelierKnowledge'
import { GET, POST } from './route'

vi.mock('@/lib/db/hotelierKnowledge', () => ({ processDueHotelierKnowledge: vi.fn(async () => 2) }))
vi.mock('@/lib/secrets', () => ({
  getSecret: async (name: string) => ({ SUPABASE_SERVICE_ROLE_KEY: 'service', CRON_SECRET: 'cron' })[name],
}))

const call = (handler: typeof GET, method: string, authorization?: string) =>
  handler(
    new Request('http://localhost/api/hotelier/knowledge/retry', {
      method,
      headers: authorization ? { authorization } : {},
    }),
  )
const post = (authorization?: string) => call(POST, 'POST', authorization)
const get = (authorization?: string) => call(GET, 'GET', authorization)

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

  it('processes the due answers for Vercel Cron with CRON_SECRET', async () => {
    const response = await get('Bearer cron')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ processed: 2 })
  })

  it('keeps the two secrets apart', async () => {
    expect((await get('Bearer service')).status).toBe(403)
    expect((await post('Bearer cron')).status).toBe(403)
    expect((await get()).status).toBe(403)
    expect(processDueHotelierKnowledge).not.toHaveBeenCalled()
  })
})
