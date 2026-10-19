import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays, formatDateRange, fromIso, nightsBetween, todayIso, toIso } from './dates'

describe('toIso', () => {
  it('formats a local date as YYYY-MM-DD with zero padding', () => {
    expect(toIso(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toIso(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })
})

describe('fromIso', () => {
  it('parses an ISO day into local midnight', () => {
    const date = fromIso('2026-10-17')
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 9, 17])
    expect([date.getHours(), date.getMinutes()]).toEqual([0, 0])
  })

  it('round-trips with toIso', () => {
    expect(toIso(fromIso('2027-02-28'))).toBe('2027-02-28')
  })
})

describe('addDays', () => {
  it('adds days within a month', () => {
    expect(addDays('2026-10-17', 1)).toBe('2026-10-18')
  })

  it('crosses a month boundary', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
  })

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })
})

describe('nightsBetween', () => {
  it('counts nights between two days', () => {
    expect(nightsBetween('2026-10-17', '2026-10-18')).toBe(1)
    expect(nightsBetween('2026-12-30', '2027-01-02')).toBe(3)
  })

  it('returns zero or negative values when check-out is not later', () => {
    expect(nightsBetween('2026-10-17', '2026-10-17')).toBe(0)
    expect(nightsBetween('2026-10-18', '2026-10-17')).toBe(-1)
  })
})

describe('todayIso', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the current local day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 17, 23, 30))
    expect(todayIso()).toBe('2026-10-17')
  })
})

describe('formatDateRange', () => {
  it('formats a range within one month', () => {
    expect(formatDateRange('2026-10-17', '2026-10-18')).toBe('17 – 18 окт. 2026 г.')
  })

  it('formats a range across months', () => {
    expect(formatDateRange('2026-10-30', '2026-11-02')).toBe('30 окт. – 2 нояб. 2026 г.')
  })

  it('formats a range across years', () => {
    expect(formatDateRange('2026-12-30', '2027-01-02')).toBe('30 дек. 2026 г. – 2 янв. 2027 г.')
  })

  it('shows an open end while check-out is not chosen', () => {
    expect(formatDateRange('2026-10-17', null)).toBe('17 окт. 2026 г. – …')
  })
})
