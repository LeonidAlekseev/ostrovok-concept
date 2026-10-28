import { describe, expect, it, vi } from 'vitest'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { toolResultSchema } from '@/lib/toolResult'
import { runNoiseTool } from './noiseTool'

vi.mock('next/cache', () => ({ unstable_cache: (read: unknown) => read }))

/**
 * «Анализ шума» on the real database (read with the anon key, as the site): run on demand with
 * `LIVE_DB=1 node --env-file=.env node_modules/vitest/vitest.mjs run src/lib/ai/noiseTool.db.test.ts`.
 */
describe.runIf(process.env.LIVE_DB === '1' && isSupabaseConfigured)('runNoiseTool on the database', () => {
  it('reads the estimate at the facade of ota-9741622, its calculation, the datasets and the OSM places', async () => {
    const result = await runNoiseTool('ota-9741622')
    expect(toolResultSchema.safeParse(result).success).toBe(true)
    expect(result.status).toBe('success')
    // The point lies only in industry below 40 dB; the facade sees the road at the door.
    expect(result.summary).toMatch(/^У фасада на улицу: днём 65–73 дБ, ночью 65–70 дБ; окна во двор: ночью 43–47 дБ/)
    const night = result.claims.find((c) => c.label === 'Фасад на улицу, ночью (23:00–07:00)')
    expect(night).toMatchObject({ value: '65–70 дБ', status: 'derived', confidence: 0.5 })
    const sources = night!.evidence_ids.map((id) => result.evidence.find((e) => e.id === id))
    expect(sources).toContainEqual(
      expect.objectContaining({ source_type: 'dataset', source_name: 'EEA', source_id: 'eea-noise-end2022-v01_r00' }),
    )
    const calculation = result.calculations.find((c) => c.id === night!.calculation_id)
    expect(calculation).toMatchObject({ version: '1' })
    expect(calculation!.inputs).toContainEqual({
      label: 'Полосы EEA у фасада на улицу',
      value: expect.stringMatching(/^Дороги города: 70–74 дБ за сутки, 65–69 дБ ночью/),
    })
    expect(result.claims.find((c) => c.label === 'Вклад заведений рядом, ночью')).toMatchObject({
      value: '≈43 дБ',
      confidence: 0.6,
    })
    const nearest = result.claims.find((c) => c.label.startsWith('Ближайшее место: кафе'))
    expect(nearest).toMatchObject({ label: 'Ближайшее место: кафе «Cerveceria Tamesis»', value: '50 м', confidence: 1 })
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
