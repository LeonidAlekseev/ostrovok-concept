import { describe, expect, it, vi } from 'vitest'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { toolResultSchema } from '@/lib/toolResult'
import { runNoiseTool } from './noiseTool'

vi.mock('next/cache', () => ({ unstable_cache: (read: unknown) => read }))

/**
 * «Анализ шума» on the real database (read with the anon key, as the site): run on demand with
 * `LIVE_DB=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run src/lib/ai/noiseTool.db.test.ts`.
 */
describe.runIf(process.env.LIVE_DB === '1' && isSupabaseConfigured)('runNoiseTool on the database', () => {
  it('reads the EEA bands, the day estimate and the OSM places of ota-9096882 with their sources', async () => {
    const result = await runNoiseTool('ota-9096882')
    expect(toolResultSchema.safeParse(result).success).toBe(true)
    expect(result.status).toBe('success')
    expect(result.summary).toMatch(/^Ночью 55–59 дБ \(дороги города\), днём оценка 55–63 дБ/)
    const night = result.claims.find((c) => c.label === 'Ночью (Lnight): дороги города')
    // The confidence of the policy (confidence-1, #350): EEA's band 0,9.
    expect(night).toMatchObject({ value: '55–59 дБ', status: 'reported', confidence: 0.9 })
    const eea = result.evidence.find((e) => e.id === night!.evidence_ids[0])
    expect(eea).toMatchObject({ source_type: 'dataset', source_name: 'EEA', source_id: 'eea-noise-end2022-v01_r00' })
    expect(eea!.source_url).toMatch(/^https:\/\/sdi\.eea\.europa\.eu\//)
    const day = result.claims.find((c) => c.label.startsWith('Днём') && c.label.endsWith('дороги города'))
    expect(day).toMatchObject({ status: 'derived', value: '55–63 дБ', confidence: 0.8 })
    const calculation = result.calculations.find((c) => c.id === day!.calculation_id)
    expect(calculation).toMatchObject({ version: '1' })
    expect(calculation!.inputs).toContainEqual({ label: 'Lden (сутки)', value: '60–64 дБ' })
    expect(calculation!.assumptions).toContain('Допущение: вечер так же громок, как день')
    expect(result.claims).toContainEqual(
      expect.objectContaining({ label: 'Рестораны в 200 м', value: '4', confidence: 0.9 }),
    )
    const nearest = result.claims.find((c) => c.label.startsWith('Ближайшее место: ресторан'))
    expect(nearest).toMatchObject({
      label: 'Ближайшее место: ресторан «Pinares 14»',
      value: '40 м',
      status: 'derived',
      confidence: 1,
    })
    expect(result.evidence.find((e) => e.id === nearest!.evidence_ids[0])).toMatchObject({
      source_type: 'osm',
      source_id: 'node/1632037131',
      source_url: 'https://www.openstreetmap.org/node/1632037131',
    })
  })

  it('quotes the reviews about the noise of ota-7857547 as the sources say them', async () => {
    const result = await runNoiseTool('ota-7857547')
    const reviews = result.evidence.filter((e) => e.source_type === 'review')
    expect(reviews.length).toBeGreaterThan(0)
    expect(reviews.length).toBeLessThanOrEqual(5)
    for (const review of reviews) {
      expect(review).toMatchObject({ source_name: 'Островок', source_url: null })
      expect(review.excerpt).toMatch(/шум|тих|тиш|громк|слыш|звукоизол/i)
      expect(review.retrieved_at).toBeTruthy()
    }
    expect(result.summary).toMatch(/отзывов о шуме и тишине: [1-5]/)
  })
})
