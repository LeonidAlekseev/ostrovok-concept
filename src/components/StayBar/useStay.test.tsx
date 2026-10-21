import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getHotel, hotels } from '@/lib/catalog'
import { DEFAULT_GUESTS } from '@/lib/search'
import { useStay } from './useStay'

const nav = vi.hoisted(() => ({ query: '', replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  usePathname: () => '/hotels/x',
  useRouter: () => ({ replace: nav.replace }),
}))

const guestsFor = (query: string) => {
  nav.query = query
  return renderHook(() => useStay(getHotel(hotels[0].id)!)).result.current
}

describe('useStay guests without dates', () => {
  it('keeps the guests of the address', () => {
    const { stay, guests } = guestsFor('adults=3&children=1&rooms=2')
    expect(stay).toBeNull()
    expect(guests).toEqual({ adults: 3, children: 1, rooms: 2 })
  })

  it('falls back to the default couple when there are none or they are invalid', () => {
    expect(guestsFor('').guests).toEqual(DEFAULT_GUESTS)
    expect(guestsFor('adults=0&rooms=1').guests).toEqual(DEFAULT_GUESTS)
    expect(guestsFor('adults=2').guests).toEqual(DEFAULT_GUESTS)
  })

  it('writes them to the address with the first chosen dates', () => {
    const { setStay } = guestsFor('adults=3&rooms=1')
    setStay({ checkIn: '2099-01-10', checkOut: '2099-01-12' })
    expect(nav.replace.mock.calls.at(-1)![0]).toContain('adults=3')
  })

  it('writes only the guests, no dates, when they are chosen without dates', () => {
    const { setStay } = guestsFor('')
    setStay({ guests: { adults: 3, children: 0, rooms: 1 } })
    const url = nav.replace.mock.calls.at(-1)![0] as string
    expect(url).toContain('adults=3')
    expect(url).not.toContain('checkin')
    expect(url).not.toContain('checkout')
  })
})
