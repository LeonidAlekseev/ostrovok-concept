import { addDays, todayIso } from '@/lib/dates'
import type { Booking } from '@/lib/storage'

/** A confirmed booking of a free-cancellation rate for tests; check-in `inDays` from today. */
export function makeBooking(id: string, inDays: number, patch: Partial<Booking> = {}): Booking {
  const checkIn = addDays(todayIso(), inDays)
  return {
    id,
    createdAt: new Date().toISOString(),
    status: 'confirmed',
    hotelId: 'prague-old-town-lantern',
    roomId: 'r1',
    rateId: 'x',
    checkIn,
    checkOut: addDays(checkIn, 2),
    guests: { adults: 2, children: 0, rooms: 1 },
    roomGuests: [{ firstName: 'Анна', lastName: 'Петрова' }],
    contact: { email: 'anna@example.com', phone: '+7 900 123-45-67' },
    requests: '',
    payment: 'at-hotel',
    cardLast4: null,
    total: 20000,
    cancellation: { kind: 'free', daysBefore: 2 },
    ...patch,
  }
}
