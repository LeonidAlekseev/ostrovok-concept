import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchHotelsKnowledge, type HotelsChunk } from '../db/claims'
import { queryVectorOrNull } from './semantic'
import { deepVerdicts } from './knowledgeTools'

vi.mock('next/cache', () => ({ unstable_cache: (read: unknown) => read }))
vi.mock('../db/anon', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../db/anon')>()),
  isRealHotelId: (id: string) => /^ota-\d+$/.test(id),
}))
vi.mock('./semantic', () => ({ queryVectorOrNull: vi.fn() }))
vi.mock('../db/claims', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../db/claims')>()),
  searchHotelsKnowledge: vi.fn(),
}))

const chunk = (
  hotelId: string,
  text: string,
  fields: Partial<HotelsChunk> = {},
  kind: HotelsChunk['kind'] = 'review',
): HotelsChunk => ({
  chunkId: crypto.randomUUID(),
  documentId: crypto.randomUUID(),
  evidenceId: crypto.randomUUID(),
  kind,
  ord: 0,
  text,
  metadata: {},
  rank: 0,
  hotelId,
  ftsPlace: 1,
  vectorPlace: null,
  similarity: null,
  ...fields,
})

const found = new Map<string, HotelsChunk[]>([
  ['ota-1', [chunk('ota-1', 'Завтраки выше всех похвал!')]],
  ['ota-2', [chunk('ota-2', 'Завтраки отличные, вкусные, качественные.'), chunk('ota-2', 'Завтрак хороший.')]],
  ['ota-3', [chunk('ota-3', 'Невкусный капсульный кофе на завтрак.')]],
  // A description close by meaning only, without the word.
  [
    'ota-6',
    [chunk('ota-6', 'Утром накрыт шведский стол.', { ftsPlace: null, vectorPlace: 1, similarity: 0.6 }, 'description')],
  ],
])

beforeEach(() => {
  vi.mocked(queryVectorOrNull).mockResolvedValue([0.1])
  vi.mocked(searchHotelsKnowledge).mockResolvedValue(found)
})

// assistant-search, Requirement: Углубленный поиск
describe('the verdicts of the deep search', () => {
  it('names a hotel whose documents praise the topic, the one with more praise first, and not one with a complaint only', async () => {
    const ids = ['ota-1', 'ota-2', 'ota-3', 'ota-4', 'ota-6', 'demo-hotel']
    const verdicts = await deepVerdicts('breakfast', ids, 'вкусные завтраки')
    expect(queryVectorOrNull).toHaveBeenCalledWith('завтрак: вкусные завтраки')
    // One read for all the hotels, not a read each.
    expect(searchHotelsKnowledge).toHaveBeenCalledTimes(1)
    expect(Object.fromEntries([...verdicts!].map(([id, v]) => [id, v.verdict]))).toEqual({
      'ota-1': 'match',
      'ota-2': 'match',
      'ota-3': 'miss',
      'ota-4': 'miss',
      'ota-6': 'match',
      'demo-hotel': 'nodata',
    })
    // ota-2 has a praised fragment and a plain one, ota-1 one praised: more praise first.
    expect(verdicts!.get('ota-2')!.score).toBeLessThan(verdicts!.get('ota-1')!.score)
  })

  it('is none when the documents could not be read', async () => {
    vi.mocked(searchHotelsKnowledge).mockResolvedValue(null)
    expect(await deepVerdicts('breakfast', ['ota-1', 'ota-2'])).toBeNull()
  })

  it('searches by the words alone without a vector', async () => {
    vi.mocked(queryVectorOrNull).mockResolvedValue(null)
    await deepVerdicts('staff', ['ota-1'])
    expect(vi.mocked(searchHotelsKnowledge).mock.calls[0][2]).toBeNull()
  })
})
