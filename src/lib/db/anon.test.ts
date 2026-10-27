import { afterEach, describe, expect, it, vi } from 'vitest'
import { isRealHotelId, readOrNull, warnShort } from './anon'

vi.mock('@/lib/supabase/config', () => ({
  isSupabaseConfigured: true,
  supabaseUrl: 'https://project.supabase.test',
  supabaseAnonKey: 'anon',
}))
vi.mock('next/cache', () => ({ unstable_cache: (read: unknown) => read }))

afterEach(() => vi.restoreAllMocks())

describe('isRealHotelId', () => {
  it('takes the hotels of Ostrovok only', () => {
    expect(isRealHotelId('ota-10100796')).toBe(true)
    expect(isRealHotelId('prague-old-town-lantern')).toBe(false)
    expect(isRealHotelId('ota-')).toBe(false)
    expect(isRealHotelId('ota-1; drop')).toBe(false)
  })
})

describe('readOrNull', () => {
  it('reads the data of a real hotel', async () => {
    expect(await readOrNull('ota-1', 'noise', async () => 42)).toBe(42)
  })

  it('does not ask for a synthetic hotel', async () => {
    const read = vi.fn(async () => 42)
    expect(await readOrNull('prague-old-town-lantern', 'noise', read)).toBeNull()
    expect(read).not.toHaveBeenCalled()
  })

  it('reads a failure as none and logs only its short message', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const read = async () => {
      throw new Error(`timeout ${'x'.repeat(300)}`)
    }
    expect(await readOrNull('ota-1', 'noise map', read)).toBeNull()
    const [line] = warn.mock.calls[0] as [string]
    expect(line).toMatch(/^noise map: none for ota-1 \(timeout x+\)$/)
    expect(line.length).toBeLessThan(240)
  })
})

describe('warnShort', () => {
  it('logs a value that is not an error as it is', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warnShort('features: no data', 'down')
    expect(warn).toHaveBeenCalledWith('features: no data (down)')
  })
})
