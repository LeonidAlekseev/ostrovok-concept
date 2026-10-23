import { describe, expect, it } from 'vitest'
import type { Rate, Room } from './catalog'
import { cancellationDeadline, ratePrice, unavailableReason } from './rates'

const free3: Rate = {
  id: 'f',
  meal: 'none',
  payment: 'now',
  pricePerNight: 5000,
  cancellation: { kind: 'free', daysBefore: 3 },
}
const hard: Rate = { ...free3, cancellation: { kind: 'non-refundable' } }
const room = { capacity: 2 } as Room

// rate-selection, Requirement: Тарифы номеров
describe('cancellationDeadline', () => {
  it('is check-in minus N days', () => {
    expect(cancellationDeadline(free3, '2026-10-29', '2026-10-19')).toBe('2026-10-26')
  })
  it('is null for a non-refundable rate', () => {
    expect(cancellationDeadline(hard, '2026-10-29', '2026-10-19')).toBeNull()
  })
  it('is null once the free period is over', () => {
    expect(cancellationDeadline(free3, '2026-10-21', '2026-10-19')).toBeNull()
    expect(cancellationDeadline(free3, '2026-10-22', '2026-10-19')).toBe('2026-10-19')
  })
})

describe('unavailableReason', () => {
  it('rejects more guests per room than capacity', () => {
    expect(unavailableReason(room, { adults: 3, children: 0, rooms: 1 })).toBe('Вмещает до 2 гостей')
  })
  it('splits guests between rooms', () => {
    expect(unavailableReason(room, { adults: 3, children: 1, rooms: 2 })).toBeNull()
    expect(unavailableReason(room, { adults: 2, children: 1, rooms: 1 })).not.toBeNull()
  })
})

describe('ratePrice', () => {
  it('is per night without dates', () => {
    expect(ratePrice(free3, null)).toEqual({ perNight: 5000, total: null })
  })
  it('multiplies nights and rooms', () => {
    const stay = { checkIn: '2026-11-01', checkOut: '2026-11-04', guests: { adults: 2, children: 0, rooms: 2 } }
    expect(ratePrice(free3, stay).total).toBe(30000)
  })
  // rate-selection, Requirement: Цена за ночь тарифа
  it('is the average night of the stay with dates', () => {
    const stay = { checkIn: '2026-10-22', checkOut: '2026-10-24', guests: { adults: 2, children: 0, rooms: 2 } }
    expect(ratePrice({ ...free3, pricePerNight: 7000 }, stay)).toEqual({ perNight: 7550, total: 30200 })
  })
})
