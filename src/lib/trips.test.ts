import { describe, expect, it } from 'vitest'
import { type Hotel } from './catalog'
import { getHotel } from './catalogGenerator'
import { cancelBooking, cancellationFee, tripsIn, tripTab } from './trips'
import type { Booking } from './storage'

// A booked rate at 7 000 ₽ a night; the room and rate ids of `base` are not in its hotel.
const hotel7000 = {
  id: 'hotel-7000',
  rooms: [{ id: 'room-7000', rates: [{ id: 'rate-7000', pricePerNight: 7000 }] }],
} as unknown as Hotel

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
const lantern = getHotel(base.hotelId)

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
    expect(cancellationFee(base, '2026-10-19', lantern)).toBe(0)
    expect(cancellationFee(base, '2026-11-08', lantern)).toBe(0)
  })
  it('is the first night after the free period', () => {
    expect(cancellationFee(base, '2026-11-09', lantern)).toBe(10000)
  })
  // trips: the first night of the booked rate, at the weekend price from Friday, for every room
  describe('at the price of the booked rate', () => {
    const booked = { ...base, hotelId: 'hotel-7000', roomId: 'room-7000', rateId: 'rate-7000' }
    const stay = (checkIn: string, checkOut: string, rooms = 1) => ({
      ...booked,
      checkIn,
      checkOut,
      guests: { adults: 2, children: 0, rooms },
    })
    it('takes the weekend price for a Friday check-in', () => {
      expect(cancellationFee({ ...stay('2026-11-06', '2026-11-08'), total: 16_200 }, '2026-11-05', hotel7000)).toBe(
        8100,
      )
    })
    it('takes the weekday price for a Thursday check-in', () => {
      expect(cancellationFee({ ...stay('2026-11-05', '2026-11-07'), total: 15_100 }, '2026-11-04', hotel7000)).toBe(
        7000,
      )
    })
    it('counts every room', () => {
      expect(cancellationFee({ ...stay('2026-11-06', '2026-11-08', 2), total: 32_400 }, '2026-11-05', hotel7000)).toBe(
        16_200,
      )
    })
  })
  it('is the whole amount for a non-refundable rate', () => {
    expect(cancellationFee({ ...base, cancellation: { kind: 'non-refundable' } }, '2026-10-19', lantern)).toBe(20000)
  })
})

describe('cancelBooking', () => {
  it('marks the booking cancelled with date and fee', () => {
    const now = new Date('2026-11-09T09:00:00Z')
    expect(cancelBooking(base, now, '2026-11-09', lantern)).toMatchObject({
      status: 'cancelled',
      cancelledAt: now.toISOString(),
      cancellationFee: 10000,
    })
  })
})
