import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signInDemo } from './actions'

const jar = vi.hoisted(() => ({ set: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect ${url}`)
  }),
}))
vi.mock('next/navigation', () => ({ redirect: nav.redirect }))

beforeEach(() => vi.clearAllMocks())

// The standalone demo: the demo account is a cookie without a secret, the browser's code reads it too.
describe('signInDemo', () => {
  it('signs in to the demo traveller with a cookie the browser can read, no password', async () => {
    expect(await signInDemo()).toEqual({})
    expect(jar.set).toHaveBeenCalledWith(
      'standalone-demo',
      'traveller',
      expect.objectContaining({ path: '/', httpOnly: false, sameSite: 'lax' }),
    )
  })

  it('opens an internal `next` itself, so no navigation of the browser races the new cookie', async () => {
    await expect(signInDemo('/trips')).rejects.toThrow('redirect /trips')
  })

  it('sends an external `next` to /', async () => {
    await expect(signInDemo('//evil.com')).rejects.toThrow('redirect /')
  })

  it('stays on the page without `next`', async () => {
    expect(await signInDemo()).toEqual({})
    expect(nav.redirect).not.toHaveBeenCalled()
  })

  it('signs in to the demo hotelier and opens the panel, whatever the `next`', async () => {
    await expect(signInDemo('/trips', 'hotelier')).rejects.toThrow('redirect /hotelier')
    expect(jar.set).toHaveBeenCalledWith('standalone-demo', 'hotelier', expect.anything())
  })

  it('takes an unknown account for the traveller', async () => {
    await signInDemo(null, 'admin' as never)
    expect(jar.set).toHaveBeenCalledWith('standalone-demo', 'traveller', expect.anything())
  })
})
