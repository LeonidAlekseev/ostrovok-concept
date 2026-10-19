import { act, renderHook } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchErrors } from '../lib/search'
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

describe('useHotelSearch submit', () => {
  const DEMO_SEARCH_MS = 700

  /** Starts a search inside act and keeps its promise, so the test decides when the demo search finishes. */
  function start(search: () => Promise<SearchErrors>) {
    let pending!: Promise<SearchErrors>
    act(() => {
      pending = search()
    })
    return pending
  }

  /** Lets the demo search finish and returns the validation errors the search resolved with. */
  async function settle(pending: Promise<unknown>) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEMO_SEARCH_MS)
    })
    return pending
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(NOW)
    vi.spyOn(window.history, 'replaceState')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the default start dates valid when the clock passes midnight after mounting', async () => {
    const { result } = renderHook(() => useHotelSearch())
    act(() => result.current.setDestination('Прага'))

    vi.setSystemTime(new Date(2026, 9, 20, 12))
    const pending = start(() => result.current.submit())

    expect(await settle(pending)).toEqual({})
  })

  it('validates check-in against the same day the form started from', async () => {
    const { result } = renderHook(() => useHotelSearch())
    act(() => {
      result.current.setDestination('Прага')
      result.current.setDates('2026-10-19', '2026-10-21')
    })

    vi.setSystemTime(new Date(2026, 9, 20, 12))
    const pending = start(() => result.current.submit())

    expect(await settle(pending)).toEqual({})
  })

  it('writes the search params into the URL after a successful search', async () => {
    const { result } = renderHook(() => useHotelSearch())
    act(() => result.current.setDestination('Прага'))

    await settle(start(() => result.current.submit()))

    expect(window.history.replaceState).toHaveBeenCalledTimes(1)
    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '?destination=prague&checkin=2026-10-20&checkout=2026-10-21&adults=2&rooms=1',
    )
    expect(result.current.status.state).toBe('done')
  })

  it('leaves the URL alone when validation fails', async () => {
    const { result } = renderHook(() => useHotelSearch())

    let errors!: SearchErrors
    await act(async () => {
      errors = await result.current.submit()
    })

    expect(errors.destination).toBeDefined()
    expect(window.history.replaceState).not.toHaveBeenCalled()
  })

  it('writes the URL only for the last search when an earlier one is aborted', async () => {
    const { result } = renderHook(() => useHotelSearch())
    act(() => result.current.setDestination('Прага'))
    const first = start(() => result.current.submit())

    const second = start(() =>
      result.current.searchFor({
        destination: 'Париж',
        checkIn: '2026-10-20',
        checkOut: '2026-10-21',
        guests: { adults: 2, children: 0, rooms: 1 },
      }),
    )
    await settle(Promise.all([first, second]))

    expect(window.history.replaceState).toHaveBeenCalledTimes(1)
    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '?destination=paris&checkin=2026-10-20&checkout=2026-10-21&adults=2&rooms=1',
    )
  })
})
