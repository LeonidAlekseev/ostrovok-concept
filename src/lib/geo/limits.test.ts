import { describe, expect, it, vi } from 'vitest'
import { RATE_RULES, RateGate } from './limits'

/** A gate on a clock the test moves: `sleep` advances it. */
function clocked(options: { shared?: (key: string, limit: number, windowS: number) => Promise<boolean | null> } = {}) {
  let now = 1_000_000
  const sleep = vi.fn(async (ms: number) => {
    now += ms
  })
  const gate = new RateGate(RATE_RULES, { ...options, now: () => now, sleep })
  return { gate, sleep, advance: (ms: number) => (now += ms) }
}

// assistant-geo, Requirement: Честные ошибки и лимиты OSM
describe('the rate limits of the OSM services', () => {
  it('follows the rules of the services', () => {
    expect(RATE_RULES.nominatim).toEqual({ gapMs: 1000, limit: 1, windowS: 1 })
    expect(RATE_RULES.osrm).toMatchObject({ limit: 1, windowS: 1 })
    expect(RATE_RULES.overpass).toMatchObject({ limit: 10, windowS: 60 })
  })

  it('keeps a second between two Nominatim requests', async () => {
    const { gate, sleep } = clocked()
    expect(await gate.acquire('nominatim', 2000)).toEqual({ ok: true })
    expect(await gate.acquire('nominatim', 2000)).toEqual({ ok: true })
    expect(sleep).toHaveBeenLastCalledWith(1000)
  })

  it('gives the wait instead of waiting past the budget', async () => {
    const { gate } = clocked()
    await gate.acquire('overpass', 1000)
    expect(await gate.acquire('overpass', 1000)).toEqual({ ok: false, retryAfterS: 6 })
  })

  it('counts each service apart', async () => {
    const { gate, sleep } = clocked()
    await gate.acquire('nominatim', 0)
    expect(await gate.acquire('osrm', 0)).toEqual({ ok: true })
    expect(sleep).not.toHaveBeenCalled()
  })

  it('stays closed for the Retry-After of a 429', async () => {
    const { gate, advance } = clocked()
    gate.close('overpass', 30)
    expect(await gate.acquire('overpass', 5000)).toEqual({ ok: false, retryAfterS: 30 })
    advance(29_500)
    expect(await gate.acquire('overpass', 5000)).toEqual({ ok: false, retryAfterS: 1 })
    advance(500)
    expect(await gate.acquire('overpass', 5000)).toEqual({ ok: true })
  })

  it('asks the shared counter of the instances and tries a full one-second window once more', async () => {
    const shared = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const { gate, sleep } = clocked({ shared })
    expect(await gate.acquire('nominatim', 2000)).toEqual({ ok: true })
    expect(shared).toHaveBeenCalledWith('osm:nominatim', 1, 1)
    expect(shared).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(1000)
  })

  it('is limited when the shared window stays full', async () => {
    const shared = vi.fn().mockResolvedValue(false)
    const { gate } = clocked({ shared })
    expect(await gate.acquire('overpass', 3000)).toEqual({ ok: false, retryAfterS: 60 })
    expect(shared).toHaveBeenCalledTimes(1)
  })

  it('counts in its memory when the shared counter is not there', async () => {
    const { gate } = clocked({ shared: vi.fn().mockResolvedValue(null) })
    expect(await gate.acquire('osrm', 0)).toEqual({ ok: true })
    const failing = clocked({ shared: vi.fn().mockRejectedValue(new Error('down')) })
    expect(await failing.gate.acquire('osrm', 0)).toEqual({ ok: true })
  })
})
