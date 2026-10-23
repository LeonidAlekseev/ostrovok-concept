import { describe, expect, it } from 'vitest'
import { spinTarget, spinView } from './globe'

// hero-globe, Requirement: Случайная идея
describe('spinTarget', () => {
  it('turns the way the globe spins by more than a full turn, to the same longitude', () => {
    for (const [from, to] of [
      [50, 40],
      [50, 60],
      [50, 50],
      [-170, 170],
      [-1000, 12],
    ]) {
      const end = spinTarget({ lat: 20, lon: from }, { lat: 45, lon: to })
      expect(from - end.lon).toBeGreaterThan(360)
      expect(from - end.lon).toBeLessThanOrEqual(720)
      expect((((end.lon - to) % 360) + 360) % 360).toBeCloseTo(0)
      expect(end.lat).toBe(45)
    }
  })
})

describe('spinView', () => {
  const spin = { from: { lat: 0, lon: 0 }, to: { lat: 40, lon: -500 }, start: 1000, duration: 2000 }

  it('starts at the start and stops at the end', () => {
    expect(spinView(spin, 1000)).toEqual({ lat: 0, lon: 0 })
    expect(spinView(spin, 3000)).toEqual({ lat: 40, lon: -500 })
    expect(spinView(spin, 9000)).toEqual({ lat: 40, lon: -500 })
  })

  it('speeds up, then slows down', () => {
    const lon = (t: number) => spinView(spin, 1000 + t).lon
    expect(lon(1000)).toBeCloseTo(-250)
    // The middle hundred milliseconds turn the globe farther than the first or the last.
    const middle = lon(950) - lon(1050)
    expect(middle).toBeGreaterThan(lon(0) - lon(100))
    expect(middle).toBeGreaterThan(lon(1900) - lon(2000))
  })
})
