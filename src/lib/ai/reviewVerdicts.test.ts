import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchHotelReviews, type KnowledgeChunk } from '../db/claims'
import { queryVectorOrNull } from './semantic'
import { reviewVerdicts } from './knowledgeTools'

vi.mock('next/cache', () => ({ unstable_cache: (read: unknown) => read }))
vi.mock('../db/anon', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../db/anon')>()),
  isRealHotelId: (id: string) => /^ota-\d+$/.test(id),
}))
vi.mock('./semantic', () => ({ queryVectorOrNull: vi.fn() }))
vi.mock('../db/claims', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../db/claims')>()),
  searchHotelReviews: vi.fn(),
}))

const chunk = (text: string, rank: number): KnowledgeChunk => ({
  chunkId: crypto.randomUUID(),
  documentId: crypto.randomUUID(),
  evidenceId: crypto.randomUUID(),
  kind: 'review',
  ord: 0,
  text,
  metadata: {},
  rank,
  ftsPlace: 1,
  vectorPlace: 1,
})

const reviews: Record<string, KnowledgeChunk[] | null> = {
  'ota-1': [chunk('Завтраки выше всех похвал!', 0.03)],
  'ota-2': [chunk('Завтраки отличные, вкусные, качественные.', 0.016), chunk('Завтрак хороший.', 0.015)],
  'ota-3': [chunk('Невкусный капсульный кофе на завтрак.', 0.04)],
  'ota-4': [],
  'ota-5': null,
}

beforeEach(() => {
  vi.mocked(queryVectorOrNull).mockResolvedValue([0.1])
  vi.mocked(searchHotelReviews).mockImplementation(async (id) => reviews[id] ?? null)
})

// assistant-search, Requirement: Поиск отелей по отзывам
describe('the verdicts of the reviews', () => {
  it('names a hotel whose guests praise the topic, the one with more praise first, and not one with a complaint only', async () => {
    const ids = ['ota-1', 'ota-2', 'ota-3', 'ota-4', 'ota-5', 'demo-hotel']
    const verdicts = await reviewVerdicts('breakfast', ids, 'вкусные завтраки')
    expect(queryVectorOrNull).toHaveBeenCalledWith('завтрак: вкусные завтраки')
    expect(Object.fromEntries([...verdicts!].map(([id, v]) => [id, v.verdict]))).toEqual({
      'ota-1': 'match',
      'ota-2': 'match',
      'ota-3': 'miss',
      'ota-4': 'miss',
      'ota-5': 'nodata',
      'demo-hotel': 'nodata',
    })
    // ota-2 has a praised fragment and a plain one, ota-1 one praised: more praise first.
    expect(verdicts!.get('ota-2')!.score).toBeLessThan(verdicts!.get('ota-1')!.score)
  })

  it('is none when no hotel could be read', async () => {
    vi.mocked(searchHotelReviews).mockResolvedValue(null)
    expect(await reviewVerdicts('breakfast', ['ota-1', 'ota-2'])).toBeNull()
  })
})
