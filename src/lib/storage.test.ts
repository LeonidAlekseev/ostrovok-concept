// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bookingsStore,
  createStore,
  favoritesStore,
  saveBooking,
  sessionStore,
  toggleFavorite,
  type Booking,
} from './storage'

const booking: Booking = {
  id: 'OS-AB12CD',
  createdAt: '2026-10-19T10:00:00.000Z',
  status: 'confirmed',
  hotelId: 'prague-old-town-lantern',
  roomId: 'standard',
  rateId: 'basic',
  checkIn: '2026-11-02',
  checkOut: '2026-11-04',
  guests: { adults: 2, children: 0, rooms: 1 },
  roomGuests: [{ firstName: 'Анна', lastName: 'Иванова' }],
  contact: { email: 'anna@example.com', phone: '+7 900 000-00-00' },
  requests: '',
  payment: 'now',
  cardLast4: '4242',
  total: 14_800,
  cancellation: { kind: 'non-refundable' },
}

afterEach(() => localStorage.clear())

describe('stores', () => {
  it('use the versioned keys', () => {
    expect([sessionStore.key, favoritesStore.key, bookingsStore.key]).toEqual([
      'ostrovok:v1:session',
      'ostrovok:v1:favorites',
      'ostrovok:v1:bookings',
    ])
  })

  it('give the empty value to the server snapshot', () => {
    localStorage.setItem('ostrovok:v1:favorites', '["a"]')
    expect(favoritesStore.get()).toEqual(['a'])
    expect(favoritesStore.getServerSnapshot()).toEqual([])
    expect(sessionStore.getServerSnapshot()).toBeNull()
  })

  it('read damaged or foreign values as empty', () => {
    localStorage.setItem('ostrovok:v1:bookings', '{not json')
    expect(bookingsStore.get()).toEqual([])
    localStorage.setItem('ostrovok:v1:bookings', '{"v":2}')
    expect(bookingsStore.get()).toEqual([])
    localStorage.setItem('ostrovok:v1:session', '"Анна"')
    expect(sessionStore.get()).toBeNull()
    localStorage.setItem('ostrovok:v1:bookings', JSON.stringify([booking, { id: 'broken' }]))
    expect(bookingsStore.get()).toEqual([booking])
  })

  it('return the same snapshot until the value changes', () => {
    favoritesStore.set(['a'])
    const first = favoritesStore.get()
    expect(favoritesStore.get()).toBe(first)
    favoritesStore.set(['b'])
    expect(favoritesStore.get()).not.toBe(first)
  })

  it('notify subscribers of own changes and of other tabs', () => {
    const listener = vi.fn()
    const unsubscribe = favoritesStore.subscribe(listener)
    toggleFavorite('prague-old-town-lantern')
    expect(listener).toHaveBeenCalledTimes(1)

    // Another tab writes the key: this tab only gets the storage event.
    localStorage.setItem('ostrovok:v1:favorites', '["oslo-fjordline-hotel"]')
    window.dispatchEvent(new StorageEvent('storage', { key: 'ostrovok:v1:favorites' }))
    expect(listener).toHaveBeenCalledTimes(2)
    expect(favoritesStore.get()).toEqual(['oslo-fjordline-hotel'])

    window.dispatchEvent(new StorageEvent('storage', { key: 'ostrovok:v1:session' }))
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    window.dispatchEvent(new StorageEvent('storage', { key: 'ostrovok:v1:favorites' }))
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('keep working when localStorage throws', () => {
    const store = createStore('ostrovok:v1:test', 0, (v) => (typeof v === 'number' ? v : null))
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(store.get()).toBe(0)
    spy.mockRestore()
  })
})

describe('toggleFavorite', () => {
  it('adds and removes a hotel', () => {
    toggleFavorite('a')
    toggleFavorite('b')
    expect(favoritesStore.get()).toEqual(['b', 'a'])
    toggleFavorite('a')
    expect(favoritesStore.get()).toEqual(['b'])
  })
})

describe('saveBooking', () => {
  it('stores only the last 4 digits of the card', () => {
    saveBooking({
      ...booking,
      cardNumber: '4242 4242 4242 4242',
      cardExpiry: '12/30',
      cvc: '123',
    } as Booking)
    const raw = localStorage.getItem('ostrovok:v1:bookings')!
    expect(raw).toContain('"4242"')
    expect(raw).not.toMatch(/4242 4242|42424242|12\/30|123/)
    expect(bookingsStore.get()).toEqual([booking])
  })

  it('replaces a booking with the same id', () => {
    saveBooking(booking)
    saveBooking({ ...booking, status: 'cancelled', cancelledAt: '2026-10-20T10:00:00.000Z', cancellationFee: 0 })
    expect(bookingsStore.get()).toEqual([
      { ...booking, status: 'cancelled', cancelledAt: '2026-10-20T10:00:00.000Z', cancellationFee: 0 },
    ])
  })

  it('refuses an invalid booking', () => {
    expect(() => saveBooking({ ...booking, total: -1 })).toThrow()
  })
})
