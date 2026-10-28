import { describe, expect, it, vi } from 'vitest'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { loadHotelRelations } from './knowledge'

vi.mock('next/cache', () => ({ unstable_cache: (read: unknown) => read }))

/**
 * The graph of a hotel on the real database (read with the anon key): run on demand with
 * `LIVE_DB=1 node --env-file=.env node_modules/vitest/vitest.mjs run src/lib/db/knowledge.db.test.ts`.
 */
describe.runIf(process.env.LIVE_DB === '1' && isSupabaseConfigured)('loadHotelRelations on the database', () => {
  const hotel = { id: 'ota-9096882', lat: 39.3833, lon: -0.33254 }

  it('reads the pharmacies near ota-9096882 with a point, a distance claim and an OSM source, nearest first', async () => {
    const relations = await loadHotelRelations(hotel, { predicate: 'near', category: 'pharmacy' })
    expect(relations!.length).toBeGreaterThan(0)
    for (const r of relations!) {
      expect(r).toMatchObject({
        predicate: 'near',
        object: { kind: 'osm_place' },
        evidence: { provider: 'OpenStreetMap' },
      })
      expect(r.object.categories).toContain('pharmacy')
      expect(r.claim?.value.kind).toBe('number')
      expect(r.object.lat).toEqual(expect.any(Number))
    }
    const meters = relations!.map((r) => (r.claim!.value as { value: number }).value)
    expect(meters).toEqual([...meters].sort((a, b) => a - b))
  })

  it('reads the building edge of ota-9096882 without a point', async () => {
    const [building] = (await loadHotelRelations(hotel, { predicate: 'nearest_building' }))!
    expect(building).toMatchObject({
      object: { kind: 'building', lat: null, lon: null },
      confidence: expect.any(Number),
    })
  })
})
