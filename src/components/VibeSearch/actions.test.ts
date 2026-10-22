import { describe, expect, it, vi } from 'vitest'
import { VIBE_HOTELS, VIBE_STEPS, type Answer } from '@/lib/vibe'
import { vibeHotelsAction } from './actions'

vi.mock('@/lib/db/catalog', () => import('@/test/catalog'))

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
