import { beforeEach, describe, expect, it, vi } from 'vitest'
import { semanticSearch } from '@/lib/ai/semantic'
import { VIBE_HOTELS, VIBE_STEPS, vibeHotels, type Answer } from '@/lib/vibe'
import { allHotels } from '@/test/catalog'
import { destinations } from '@/data/destinations'
import { vibeHotelsAction } from './actions'

vi.mock('@/lib/db/catalog', () => import('@/test/catalog'))
vi.mock('@/lib/ai/semantic', () => ({ semanticSearch: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '198.51.100.7' }) }))

const all = (answer: Answer) => Array.from({ length: VIBE_STEPS }, () => answer)

beforeEach(() => {
  vi.mocked(semanticSearch).mockReset().mockResolvedValue(null)
})

describe('vibeHotelsAction', () => {
  it('returns plain data a client component can take: no functions', async () => {
    const hotels = await vibeHotelsAction(Array.from({ length: VIBE_STEPS }, () => 1 as Answer))
    expect(hotels).toHaveLength(VIBE_HOTELS)
    expect(JSON.parse(JSON.stringify(hotels))).toEqual(hotels)
  })

  it('rejects answers of another length or value', async () => {
    await expect(vibeHotelsAction([1, 0])).rejects.toThrow()
    await expect(vibeHotelsAction(Array.from({ length: VIBE_STEPS }, () => 2 as Answer))).rejects.toThrow()
  })
})

describe('vibeHotelsAction with the semantic search', () => {
  it('asks with the chosen sides and leads with its hotels, one per city, the axes filling the rest', async () => {
    const [a, sameCity] = allHotels().filter((h) => h.destinationId === 'prague')
    const b = allHotels().find((h) => h.destinationId === 'tokyo')!
    vi.mocked(semanticSearch).mockResolvedValue(
      [a, sameCity, b].map((h) => ({ id: h.id, destinationId: h.destinationId, score: 1 })),
    )
    const picked = await vibeHotelsAction(all(-1))
    expect(vi.mocked(semanticSearch).mock.calls[0][0]).toContain('Тихий вечер')
    expect(picked.slice(0, 2).map((h) => h.id)).toEqual([a.id, b.id])
    expect(picked).toHaveLength(VIBE_HOTELS)
    expect(new Set(picked.map((h) => h.destinationId)).size).toBe(VIBE_HOTELS)
  })

  it('keeps the axes’ pick when the search is unavailable or nothing is chosen', async () => {
    const rules = vibeHotels(all(1), allHotels(), destinations).map((h) => h.id)
    expect((await vibeHotelsAction(all(1))).map((h) => h.id)).toEqual(rules)
    await vibeHotelsAction(all(0))
    expect(semanticSearch).toHaveBeenCalledTimes(1)
  })
})
