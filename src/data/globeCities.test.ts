import { describe, expect, it } from 'vitest'
import { cityAt } from '../components/Hero/globeScene'
import { globeCities } from './globeCities'

describe('globeCities', () => {
  it('has unique ids, real coordinates and both kinds', () => {
    expect(new Set(globeCities.map((c) => c.id)).size).toBe(globeCities.length)
    for (const c of globeCities) {
      expect(Math.abs(c.lat)).toBeLessThanOrEqual(90)
      expect(Math.abs(c.lon)).toBeLessThanOrEqual(180)
    }
    expect(globeCities.filter((c) => c.kind === 'resort').length).toBeGreaterThanOrEqual(30)
    expect(globeCities.filter((c) => c.kind === 'capital').length).toBeGreaterThan(150)
  })

  it('finds a city under a point and none far from every city', () => {
    const berlin = globeCities.find((c) => c.name === 'Берлин')!
    const view = { lat: berlin.lat, lon: berlin.lon }
    expect(cityAt(view, 100, 100, 200, 5)?.name).toBe('Берлин')
    expect(cityAt(view, 100, 40, 200, 3)).toBeNull()
  })
})
