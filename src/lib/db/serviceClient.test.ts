import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSecret: vi.fn(), createClient: vi.fn(() => ({ marker: 'service' })) }))

vi.mock('server-only', () => ({}))
vi.mock('../supabase/config', () => ({ isSupabaseConfigured: true, supabaseUrl: 'https://db.test' }))
vi.mock('../secrets', () => ({ getSecret: mocks.getSecret }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

const load = async () => (await import('./serviceClient')).serviceClient

describe('serviceClient', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    mocks.getSecret.mockReset()
    mocks.createClient.mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('creates one client for every caller', async () => {
    mocks.getSecret.mockResolvedValue('service-key')
    const serviceClient = await load()
    const [a, b] = await Promise.all([serviceClient(), serviceClient()])
    expect(a).toBe(b)
    expect(mocks.createClient).toHaveBeenCalledTimes(1)
  })

  it('is null without the key', async () => {
    mocks.getSecret.mockResolvedValue(undefined)
    expect(await (await load())()).toBeNull()
  })

  it('gives up on a key that does not come, and asks for it again the next time', async () => {
    mocks.getSecret.mockReturnValueOnce(new Promise(() => {}))
    const serviceClient = await load()
    const first = serviceClient()
    await vi.advanceTimersByTimeAsync(3000)
    expect(await first).toBeNull()
    mocks.getSecret.mockResolvedValue('service-key')
    expect(await serviceClient()).not.toBeNull()
  })
})
