import { describe, expect, it } from 'vitest'
import { type Hotel } from './catalog'
import { getHotel } from './catalogGenerator'
import {
  applyDateChange,
  cancelBooking,
  cancellationFee,
  parseDateChange,
  quoteDateChange,
  tripBooking,
  tripsIn,
  tripTab,
} from './trips'
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

// trips-assistant: a change of the dates counted as at booking, applied only to the booking it was counted for
describe('changing the dates', () => {
  const hotel = {
    id: 'hotel-7000',
    rooms: [
      {
        id: 'room-7000',
        rates: [{ id: 'rate-7000', pricePerNight: 7000, cancellation: { kind: 'free', daysBefore: 3 } }],
      },
    ],
  } as unknown as Hotel
  // 10–12 ноября 2026: Tuesday and Wednesday nights.
  const booked: Booking = { ...base, hotelId: 'hotel-7000', roomId: 'room-7000', rateId: 'rate-7000', total: 14000 }
  const today = '2026-10-27'

  it('sends no personal fields to Эвал', () => {
    const sent = tripBooking({ ...booked, cardLast4: '4242', requests: 'Тихий номер' })
    expect(Object.keys(sent)).not.toEqual(expect.arrayContaining(['roomGuests']))
    expect(sent).not.toHaveProperty('contact')
    expect(sent).not.toHaveProperty('requests')
    expect(sent).not.toHaveProperty('cardLast4')
    expect(sent).toMatchObject({ id: 'OS-AAAAAA', total: 14000 })
  })

  it('counts Friday and Saturday nights at the weekend price, for every room', () => {
    const quote = quoteDateChange(booked, hotel, '2026-11-13', '2026-11-15', today)
    expect(quote).toEqual({
      ok: true,
      change: {
        bookingId: 'OS-AAAAAA',
        from: { checkIn: '2026-11-10', checkOut: '2026-11-12', total: 14000 },
        checkIn: '2026-11-13',
        checkOut: '2026-11-15',
        total: 14580,
        cancellation: { kind: 'free', daysBefore: 3 },
      },
    })
    const rooms = quoteDateChange(
      { ...booked, guests: { adults: 4, children: 0, rooms: 2 } },
      hotel,
      '2026-11-13',
      '2026-11-15',
      today,
    )
    expect(rooms.ok && rooms.change.total).toBe(29160)
  })

  it('makes a rate non-refundable once its free period for the new dates is over', () => {
    const quote = quoteDateChange(booked, hotel, '2026-10-28', '2026-10-30', today)
    expect(quote.ok && quote.change.cancellation).toEqual({ kind: 'non-refundable' })
  })

  it('refuses what cannot move', () => {
    const error = (quote: ReturnType<typeof quoteDateChange>) => !quote.ok && quote.error
    expect(error(quoteDateChange(booked, hotel, '2026-10-20', '2026-10-22', today))).toBe('Дата заезда уже прошла')
    expect(error(quoteDateChange(booked, hotel, '2026-11-15', '2026-11-13', today))).toBe(
      'Дата выезда должна быть позже даты заезда',
    )
    expect(error(quoteDateChange(booked, hotel, '2026-11-10', '2026-11-12', today))).toBe(
      'Это те же даты, что в бронировании',
    )
    expect(
      error(quoteDateChange({ ...booked, status: 'cancelled' }, hotel, '2026-11-13', '2026-11-15', today)),
    ).toMatch(/отменено/)
    expect(error(quoteDateChange(booked, undefined, '2026-11-13', '2026-11-15', today))).toMatch(/Тарифа/)
    expect(error(quoteDateChange(booked, hotel, '2026-11-13', '2026-12-20', today))).toMatch(/30 ночей/)
  })

  it('applies the change to the booking it was counted for, and to nothing else', () => {
    const quote = quoteDateChange(booked, hotel, '2026-11-13', '2026-11-15', today)
    if (!quote.ok) throw new Error(quote.error)
    expect(applyDateChange(booked, quote.change, today)).toEqual({
      ...booked,
      checkIn: '2026-11-13',
      checkOut: '2026-11-15',
      total: 14580,
      cancellation: { kind: 'free', daysBefore: 3 },
    })
    expect(applyDateChange({ ...booked, checkOut: '2026-11-13' }, quote.change, today)).toBeNull()
    expect(applyDateChange({ ...booked, status: 'cancelled' }, quote.change, today)).toBeNull()
    expect(applyDateChange({ ...booked, id: 'OS-BBBBBB' }, quote.change, today)).toBeNull()
    expect(applyDateChange(booked, quote.change, '2026-11-14')).toBeNull()
  })

  it('reads a change of an answer or a saved chat, and nothing off its shape', () => {
    const quote = quoteDateChange(booked, hotel, '2026-11-13', '2026-11-15', today)
    if (!quote.ok) throw new Error(quote.error)
    expect(parseDateChange(JSON.parse(JSON.stringify(quote.change)))).toEqual(quote.change)
    expect(parseDateChange({ ...quote.change, bookingId: 'x' })).toBeUndefined()
    expect(parseDateChange({ ...quote.change, total: -1 })).toBeUndefined()
    expect(parseDateChange({ ...quote.change, checkIn: '13.11' })).toBeUndefined()
  })
})
