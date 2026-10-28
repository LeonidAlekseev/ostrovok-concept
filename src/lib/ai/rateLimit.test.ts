import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const config = vi.hoisted(() => ({
  isSupabaseConfigured: true,
  supabaseUrl: 'https://db.example',
  supabaseAnonKey: 'a',
}))
const secrets = vi.hoisted(() => ({ getSecret: vi.fn() }))
const supabase = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/config', () => config)
vi.mock('@/lib/secrets', () => secrets)
vi.mock('@supabase/supabase-js', () => supabase)

/** A fresh module: the client of the shared counter is made once per process. */
const rateLimit = async () => {
  vi.resetModules()
  return import('./rateLimit')
}

/** One counter in "Supabase" for every instance: the hits of a key in the window, as `rate_limit_hit` counts them. */
function sharedDatabase() {
  const counts = new Map<string, number>()
  const rpc = vi.fn((_name: string, { hit_key, hit_limit }: { hit_key: string; hit_limit: number }) => {
    const count = (counts.get(hit_key) ?? 0) + 1
    counts.set(hit_key, count)
    return { abortSignal: async () => ({ data: count <= hit_limit, error: null }) }
  })
  supabase.createClient.mockReturnValue({ rpc })
  return rpc
}

beforeEach(() => {
  config.isSupabaseConfigured = true
  secrets.getSecret.mockResolvedValue('service')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

// assistant-search, Requirement: Лимит фото
describe('the limit of the photos', () => {
  it('is 20 a minute per IP, one for every instance of the server (Scenario: Два инстанса)', async () => {
    const rpc = sharedDatabase()
    const first = await rateLimit()
    const second = await rateLimit()
    for (let i = 0; i < 10; i++) expect(await first.allowVisionRequest('192.0.2.7')).toBe(true)
    for (let i = 0; i < 10; i++) expect(await second.allowVisionRequest('192.0.2.7')).toBe(true)
    expect(await first.allowVisionRequest('192.0.2.7')).toBe(false)
    expect(await second.allowVisionRequest('192.0.2.8')).toBe(true)
    expect(supabase.createClient).toHaveBeenCalledWith('https://db.example', 'service', expect.anything())
    const [name, args] = rpc.mock.calls[0]
    expect(name).toBe('rate_limit_hit')
    expect(args).toEqual({ hit_key: expect.stringMatching(/^vision:[0-9a-f]{32}$/), hit_limit: 20, window_seconds: 60 })
    // The counter keeps a hash, not the address.
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('192.0.2.7')
  })

  it('is counted in the memory of the instance without Supabase', async () => {
    config.isSupabaseConfigured = false
    const { allowVisionRequest, VISION_RATE_LIMIT } = await rateLimit()
    const now = Date.now()
    for (let i = 0; i < VISION_RATE_LIMIT; i++) expect(await allowVisionRequest('192.0.2.9', now)).toBe(true)
    expect(await allowVisionRequest('192.0.2.9', now)).toBe(false)
    expect(await allowVisionRequest('192.0.2.9', now + 60_000)).toBe(true)
    expect(supabase.createClient).not.toHaveBeenCalled()
  })

  it('is counted in memory without the service role key', async () => {
    secrets.getSecret.mockResolvedValue(undefined)
    const { allowVisionRequest } = await rateLimit()
    expect(await allowVisionRequest('192.0.2.10')).toBe(true)
    expect(supabase.createClient).not.toHaveBeenCalled()
  })

  it('is counted in memory while the migration is not applied or the database fails', async () => {
    const rpc = vi.fn(() => ({
      abortSignal: async () => ({
        data: null,
        error: { message: 'Could not find the function public.rate_limit_hit' },
      }),
    }))
    supabase.createClient.mockReturnValue({ rpc })
    const { allowVisionRequest } = await rateLimit()
    const now = Date.now()
    for (let i = 0; i < 20; i++) expect(await allowVisionRequest('192.0.2.11', now)).toBe(true)
    expect(await allowVisionRequest('192.0.2.11', now)).toBe(false)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('rate_limit_hit: Could not find'))

    rpc.mockImplementation(() => ({
      abortSignal: async () => {
        throw new Error('fetch failed')
      },
    }))
    expect(await allowVisionRequest('192.0.2.12', now)).toBe(true)
  })
})

// assistant-search, Requirement: Общий лимит запросов к Эвалу
describe('the limit of the requests', () => {
  it('is 20 a minute per IP in Supabase, one for every instance of the server (Scenario: Превышение лимита)', async () => {
    const rpc = sharedDatabase()
    const first = await rateLimit()
    const second = await rateLimit()
    for (let i = 0; i < 10; i++) expect(await first.allowRequest('192.0.2.20')).toBe(true)
    for (let i = 0; i < 10; i++) expect(await second.allowRequest('192.0.2.20')).toBe(true)
    expect(await first.allowRequest('192.0.2.20')).toBe(false)
    expect(await second.allowRequest('192.0.2.21')).toBe(true)
    const [name, args] = rpc.mock.calls[0]
    expect(name).toBe('rate_limit_hit')
    expect(args).toEqual({
      hit_key: expect.stringMatching(/^request:[0-9a-f]{32}$/),
      hit_limit: 20,
      window_seconds: 60,
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('192.0.2.20')
  })

  it('is counted in the memory of the instance without Supabase', async () => {
    config.isSupabaseConfigured = false
    const { allowRequest, RATE_LIMIT } = await rateLimit()
    const now = Date.now()
    for (let i = 0; i < RATE_LIMIT; i++) expect(await allowRequest('192.0.2.22', now)).toBe(true)
    expect(await allowRequest('192.0.2.22', now)).toBe(false)
    expect(await allowRequest('192.0.2.22', now + 60_000)).toBe(true)
    expect(supabase.createClient).not.toHaveBeenCalled()
  })

  it('counts the questions about a hotel apart from the requests (Scenario: Подбор исчерпал лимит)', async () => {
    config.isSupabaseConfigured = false
    const { allowRequest, allowHotelRequest, RATE_LIMIT, HOTEL_RATE_LIMIT } = await rateLimit()
    const now = Date.now()
    for (let i = 0; i < RATE_LIMIT; i++) expect(await allowRequest('192.0.2.23', now)).toBe(true)
    expect(await allowRequest('192.0.2.23', now)).toBe(false)
    for (let i = 0; i < HOTEL_RATE_LIMIT; i++) expect(await allowHotelRequest('192.0.2.23', now)).toBe(true)
    expect(await allowHotelRequest('192.0.2.23', now)).toBe(false)
  })

  it('is counted in memory when the shared counter fails or does not answer in time', async () => {
    const rpc = vi.fn(() => ({
      abortSignal: async () => {
        throw new Error('fetch failed')
      },
    }))
    supabase.createClient.mockReturnValue({ rpc })
    const { allowRequest, RATE_LIMIT } = await rateLimit()
    const now = Date.now()
    for (let i = 0; i < RATE_LIMIT; i++) expect(await allowRequest('192.0.2.23', now)).toBe(true)
    expect(await allowRequest('192.0.2.23', now)).toBe(false)
  })
})
