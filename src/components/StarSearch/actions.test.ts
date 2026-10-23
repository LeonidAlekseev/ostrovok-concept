import { beforeEach, describe, expect, it, vi } from 'vitest'
import { semanticSearch } from '@/lib/ai/semantic'
import { readStarsAction } from './actions'

vi.mock('@/lib/db/catalog', () => import('@/test/catalog'))
vi.mock('@/lib/ai/semantic', () => ({ semanticSearch: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '198.51.100.8' }) }))

beforeEach(() => {
  vi.mocked(semanticSearch).mockReset().mockResolvedValue(null)
})

const input = {
  name: 'Анна',
  birthMonth: 4,
  birthDay: 12,
  checkIn: '2026-11-01',
  company: 'pair' as const,
  partnerSignId: 'leo',
}

describe('readStarsAction', () => {
  it('returns plain data a client component can take: no functions', async () => {
    const reading = await readStarsAction(input)
    expect(reading.hotels).toHaveLength(3)
    expect(JSON.parse(JSON.stringify(reading))).toEqual(reading)
  })

  it('rejects a malformed reading', async () => {
    await expect(readStarsAction({ ...input, birthMonth: 13 })).rejects.toThrow()
    await expect(readStarsAction({ ...input, checkIn: 'tomorrow' })).rejects.toThrow()
  })

  // star-search, Requirement: Готовый маршрут в итоге
  it('adds the route found for the reading within the swirl, never sending the name', async () => {
    vi.mocked(semanticSearch).mockResolvedValue([{ id: 'rome-luxury', destinationId: 'rome', score: 1 }])
    const reading = await readStarsAction(input)
    expect(reading.routeId).toBe('rome-luxury')
    const [text, options] = vi.mocked(semanticSearch).mock.calls[0]
    expect(text).toContain('Поездка вдвоём')
    expect(text).not.toContain('Анна')
    expect(options).toEqual({ kind: 'route', k: 1, timeoutMs: 2500 })
  })

  it('keeps the rules when the search is unavailable', async () => {
    expect(await readStarsAction(input)).not.toHaveProperty('routeId')
  })
})
