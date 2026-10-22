import { describe, expect, it, vi } from 'vitest'
import { readStarsAction } from './actions'

vi.mock('@/lib/db/catalog', () => import('@/test/catalog'))

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
})
