import { describe, expect, it } from 'vitest'
import { cancelBooking, cancellationFee, tripsIn, tripTab } from './trips'
import type { Booking } from './storage'

const base: Booking = {
  id: 'OS-AAAAAA',
  createdAt: '2026-10-01T10:00:00.000Z',
  status: 'confirmed',
  hotelId: 'prague-old-town-lantern',
  roomId: 'r',
  rateId: 'r',
  checkIn: '2026-11-10',
  checkOut: '2026-11-12',
  guests: { adults: 2, children: 0, rooms: 1 },
  roomGuests: [{ firstName: 'Анна', lastName: 'Петрова' }],
  contact: { email: 'a@b.co', phone: '+7 900 123-45-67' },
  requests: '',
  payment: 'at-hotel',
  cardLast4: null,
  total: 20000,
  cancellation: { kind: 'free', daysBefore: 2 },
}

describe('tripTab', () => {
  it('splits by status and check-out', () => {
    expect(tripTab(base, '2026-10-19')).toBe('upcoming')
    expect(tripTab(base, '2026-11-12')).toBe('upcoming')
    expect(tripTab(base, '2026-11-13')).toBe('past')
    expect(tripTab({ ...base, status: 'cancelled' }, '2026-10-19')).toBe('cancelled')
  })
})

describe('tripsIn', () => {
  const later = { ...base, id: 'OS-BBBBBB', checkIn: '2026-12-01', checkOut: '2026-12-03' }
  it('sorts upcoming ascending and the others descending', () => {
    expect(tripsIn([later, base], 'upcoming', '2026-10-19').map((b) => b.id)).toEqual(['OS-AAAAAA', 'OS-BBBBBB'])
    expect(tripsIn([base, later], 'past', '2027-01-01').map((b) => b.id)).toEqual(['OS-BBBBBB', 'OS-AAAAAA'])
  })
})

describe('cancellationFee', () => {
  it('is 0 up to the last free day', () => {
    expect(cancellationFee(base, '2026-10-19')).toBe(0)
    expect(cancellationFee(base, '2026-11-08')).toBe(0)
  })
  it('is the first night after the free period', () => {
    expect(cancellationFee(base, '2026-11-09')).toBe(10000)
  })
  it('is the whole amount for a non-refundable rate', () => {
    expect(cancellationFee({ ...base, cancellation: { kind: 'non-refundable' } }, '2026-10-19')).toBe(20000)
  })
})

describe('cancelBooking', () => {
  it('marks the booking cancelled with date and fee', () => {
    const now = new Date('2026-11-09T09:00:00Z')
    expect(cancelBooking(base, now, '2026-11-09')).toMatchObject({
      status: 'cancelled',
      cancelledAt: now.toISOString(),
      cancellationFee: 10000,
    })
  })
})
