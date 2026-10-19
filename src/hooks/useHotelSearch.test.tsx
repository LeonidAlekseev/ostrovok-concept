import { act, renderHook } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHotelSearch } from './useHotelSearch'

const NOW = new Date(2026, 9, 19, 12)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useHotelSearch start dates', () => {
  it('fills check-in with tomorrow and check-out with the night after once mounted', () => {
    const { result } = renderHook(() => useHotelSearch())

    expect(result.current.query.checkIn).toBe('2026-10-20')
    expect(result.current.query.checkOut).toBe('2026-10-21')
  })

  it('renders empty dates on the server so hydration markup matches', () => {
    function Probe() {
      const { query } = useHotelSearch()
      return <output data-check-in={query.checkIn} data-check-out={query.checkOut} />
    }

    const html = renderToString(<Probe />)

    expect(html).toBe('<output data-check-in="" data-check-out=""></output>')
  })

  it('returns the dates the user picked instead of the defaults', () => {
    const { result } = renderHook(() => useHotelSearch())

    act(() => result.current.setDates('2026-11-01', '2026-11-04'))

    expect(result.current.query.checkIn).toBe('2026-11-01')
    expect(result.current.query.checkOut).toBe('2026-11-04')
  })
})
