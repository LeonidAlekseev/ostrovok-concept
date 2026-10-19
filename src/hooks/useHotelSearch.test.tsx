import { act, renderHook } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHotelSearch } from './useHotelSearch'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const NOW = new Date(2026, 9, 19, 12)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  push.mockClear()
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

// manual-search, Requirement: Демо-поиск и результаты
describe('useHotelSearch submit', () => {
  it('keeps the default start dates valid when the clock passes midnight after mounting', () => {
    const { result } = renderHook(() => useHotelSearch())
    act(() => result.current.setDestination('Прага'))

    vi.setSystemTime(new Date(2026, 9, 20, 12))
    let errors = {}
    act(() => {
      errors = result.current.submit()
    })

    expect(errors).toEqual({})
  })

  it('validates check-in against the same day the form started from', () => {
    const { result } = renderHook(() => useHotelSearch())
    act(() => {
      result.current.setDestination('Прага')
      result.current.setDates('2026-10-19', '2026-10-21')
    })

    vi.setSystemTime(new Date(2026, 9, 20, 12))
    let errors = {}
    act(() => {
      errors = result.current.submit()
    })

    expect(errors).toEqual({})
  })

  it('opens the results page with the query in the URL', () => {
    const { result } = renderHook(() => useHotelSearch())
    act(() => result.current.setDestination('Прага'))

    act(() => {
      result.current.submit()
    })

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith(
      '/search?destination=prague&checkin=2026-10-20&checkout=2026-10-21&adults=2&rooms=1',
    )
  })

  it('opens the results page of a scenario with its id', () => {
    const { result } = renderHook(() => useHotelSearch())

    act(() => {
      result.current.searchFor({
        destination: 'У моря',
        checkIn: '2026-10-20',
        checkOut: '2026-10-23',
        guests: { adults: 2, children: 1, rooms: 1 },
      })
    })

    expect(push).toHaveBeenCalledWith(
      '/search?scenario=sea&checkin=2026-10-20&checkout=2026-10-23&adults=2&children=1&rooms=1',
    )
    expect(result.current.query.destination).toBe('У моря')
  })

  it('stays on the page and returns the errors when validation fails', () => {
    const { result } = renderHook(() => useHotelSearch())

    let errors: ReturnType<typeof result.current.submit> = {}
    act(() => {
      errors = result.current.submit()
    })

    expect(errors.destination).toBeDefined()
    expect(result.current.errors.destination).toBe(errors.destination)
    expect(push).not.toHaveBeenCalled()
  })

  it('starts from the given query and errors', () => {
    const { result } = renderHook(() =>
      useHotelSearch({
        query: { destination: '', checkIn: '', checkOut: '', guests: { adults: 1, children: 0, rooms: 1 } },
        errors: { destination: 'Укажите, куда вы хотите поехать' },
      }),
    )

    expect(result.current.query.guests.adults).toBe(1)
    expect(result.current.query.checkIn).toBe('2026-10-20')
    expect(result.current.errors.destination).toBe('Укажите, куда вы хотите поехать')
  })
})
