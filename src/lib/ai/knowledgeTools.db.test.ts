import { describe, expect, it, vi } from 'vitest'
import { loadLevelIndex, loadNearIndex } from '@/lib/db/knowledge'
import { loadHotelSummaries } from '@/lib/db/catalog'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { toolResultSchema } from '@/lib/toolResult'
import { runKnowledge, rulesKnowledge, type KnowledgeDeps } from './knowledgeTurn'
import { runFeaturesTool, runNearTool, runReviewsTool } from './knowledgeTools'

vi.mock('next/cache', () => ({ unstable_cache: (read: unknown) => read }))

/**
 * The tools of the choice on the real database (read with the anon key, as the site), the runs not written (a guest):
 * `LIVE_DB=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run src/lib/ai/knowledgeTools.db.test.ts`.
 */
describe.runIf(process.env.LIVE_DB === '1' && isSupabaseConfigured)('the tools of the choice on the database', () => {
  it('finds hotels of Valencia with a pharmacy near and a quiet night, with the store’s claims', async () => {
    const calls = rulesKnowledge('Найди отель в Валенсии, чтобы рядом была аптека и было тихо ночью', {})
    const candidates = (await loadHotelSummaries())
      .filter((h) => h.destinationId === 'valencia')
      .map((h) => ({ id: h.id, name: h.name }))
    expect(candidates.length).toBeGreaterThan(100)
    const deps: KnowledgeDeps = {
      levels: loadLevelIndex,
      near: loadNearIndex,
      runFeatures: runFeaturesTool,
      runNear: runNearTool,
      runReviews: runReviewsTool,
      record: async (_owner, _tool, _input, execute) => ({ id: crypto.randomUUID(), result: await execute() }),
    }
    const outcome = await runKnowledge({ calls, planner: 'rules' }, candidates, {
      owner: null,
      deadline: Date.now() + 20_000,
      deps,
    })
    expect(outcome.complete).toBe(true)
    expect(outcome.chosen.length).toBe(6)
    const [features, pharmacy, reviews] = outcome.runs.map((r) => r.run.result)
    for (const result of [features, pharmacy, reviews]) {
      expect(toolResultSchema.safeParse(result).success).toBe(true)
      expect(result.status).toBe('success')
    }
    expect(features.summary).toMatch(/^Ночью тише 50 дБ: подходят \d+ из \d+ отелей/)
    // Each chosen hotel: its loudest night band of EEA below 50 dB, at 90 %, from the dataset of EEA.
    for (const id of outcome.chosen) {
      const group = features.groups!.find((g) => g.id === id)!
      const night = features.claims.find((c) => c.id === group.claim_ids[0])!
      expect(night.label).toMatch(/^Ночью \(Lnight\), (громче всего|все источники шума EEA)/)
      expect(night.value).toMatch(/^(ниже 40|4[05]–4[49]) дБ$/)
      expect(night.confidence).toBe(0.9)
      expect(features.evidence.find((e) => e.id === night.evidence_ids[0])).toMatchObject({ source_name: 'EEA' })
      // Its pharmacy within 500 m: a claim of the distance with its source of OSM or Островок.
      const near = pharmacy.groups!.find((g) => g.id === id)!
      expect(near.note).toMatch(/в пределах 500 м$/)
      const place = pharmacy.claims.find((c) => c.id === near.claim_ids[0])!
      expect(place.label).toMatch(/^Аптека/)
      expect(place.confidence).toBe(1)
      const source = pharmacy.evidence.find((e) => e.id === place.evidence_ids[0])!
      expect(['OpenStreetMap', 'Островок']).toContain(source.source_name)
    }
    for (const claim of reviews.claims) expect(claim).toMatchObject({ status: 'reported', confidence: 0.75 })
  }, 30_000)
})
