import type { Cancellation, Payment } from './catalog'
import type { IsoDate } from './dates'
import type { Guests } from './search'

/**
 * Demo user state in localStorage: there is no backend. Each store reads its key lazily and
 * caches the parsed value by the raw string, so snapshots stay referentially stable for
 * `useSyncExternalStore`. The server (prerender) and hydration see the empty value; a damaged
 * or foreign value also reads as empty. Other tabs are followed through the `storage` event.
 */

export interface Store<T> {
  readonly key: string
  get(): T
  /** The empty value: used for prerender and hydration, so the markup matches. */
  getServerSnapshot(): T
  set(next: T): void
  update(change: (current: T) => T): void
  subscribe(listener: () => void): () => void
}

export function createStore<T>(key: string, empty: T, parse: (value: unknown) => T | null): Store<T> {
  let cachedRaw: string | null = null
  let cached = empty
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())
  const onStorage = (event: StorageEvent) => {
    // `key` is null when another tab cleared the whole storage.
    if (event.key === key || event.key === null) notify()
  }

  const readRaw = (): string | null => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  }

  const get = (): T => {
    if (typeof window === 'undefined') return empty
    const raw = readRaw()
    if (raw === cachedRaw) return cached
    cachedRaw = raw
    try {
      cached = raw === null ? empty : (parse(JSON.parse(raw)) ?? empty)
    } catch {
      cached = empty
    }
    return cached
  }

  const set = (next: T) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // Storage is full or disabled: the demo keeps working, the change is not kept.
    }
    notify()
  }

  return {
    key,
    get,
    getServerSnapshot: () => empty,
    set,
    update: (change) => set(change(get())),
    subscribe(listener) {
      if (listeners.size === 0) window.addEventListener('storage', onStorage)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) window.removeEventListener('storage', onStorage)
      }
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Validation helpers

type Shape = Record<string, unknown>
const isObject = (value: unknown): value is Shape => typeof value === 'object' && value !== null
const isString = (value: unknown): value is string => typeof value === 'string'
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0
const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

// ---------------------------------------------------------------------------------------------
// Session

export interface Session {
  name: string
  email: string
}

export const sessionStore = createStore<Session | null>('ostrovok:v1:session', null, (value) =>
  isObject(value) && isString(value.name) && isString(value.email) ? { name: value.name, email: value.email } : null,
)

// ---------------------------------------------------------------------------------------------
// Favorites: hotel ids, most recently added first

export const favoritesStore = createStore<string[]>('ostrovok:v1:favorites', [], (value) =>
  Array.isArray(value) ? value.filter(isString) : null,
)

export function toggleFavorite(hotelId: string) {
  favoritesStore.update((ids) => (ids.includes(hotelId) ? ids.filter((id) => id !== hotelId) : [hotelId, ...ids]))
}

// ---------------------------------------------------------------------------------------------
// Bookings

export interface Booking {
  /** `OS-` and 6 characters `[A-Z0-9]`. */
  id: string
  /** ISO timestamp. */
  createdAt: string
  status: 'confirmed' | 'cancelled'
  hotelId: string
  roomId: string
  rateId: string
  checkIn: IsoDate
  checkOut: IsoDate
  guests: Guests
  /** The main guest of each room. */
  roomGuests: { firstName: string; lastName: string }[]
  contact: { email: string; phone: string }
  requests: string
  payment: Payment
  /** Only the last 4 digits: the card number, expiry and CVC are never stored. */
  cardLast4: string | null
  /** For the whole stay and all rooms, ₽. */
  total: number
  cancellation: Cancellation
  /** ISO timestamp, set when cancelled. */
  cancelledAt?: string
  /** Withheld on cancellation, ₽. */
  cancellationFee?: number
}

function toCancellation(value: unknown): Cancellation | null {
  if (!isObject(value)) return null
  if (value.kind === 'non-refundable') return { kind: 'non-refundable' }
  if (value.kind === 'free' && isCount(value.daysBefore)) return { kind: 'free', daysBefore: value.daysBefore }
  return null
}

/**
 * A booking with known fields only, or `null` if it is not one. Both reading and saving go
 * through it, so nothing else — a card number above all — ever reaches the storage.
 */
export function toStoredBooking(value: unknown): Booking | null {
  if (!isObject(value)) return null
  const { guests, contact, roomGuests } = value
  const cancellation = toCancellation(value.cancellation)
  if (
    !isString(value.id) ||
    !isString(value.createdAt) ||
    (value.status !== 'confirmed' && value.status !== 'cancelled') ||
    !isString(value.hotelId) ||
    !isString(value.roomId) ||
    !isString(value.rateId) ||
    !isString(value.checkIn) ||
    !isString(value.checkOut) ||
    !isObject(guests) ||
    !isCount(guests.adults) ||
    !isCount(guests.children) ||
    !isCount(guests.rooms) ||
    !Array.isArray(roomGuests) ||
    !roomGuests.every((g) => isObject(g) && isString(g.firstName) && isString(g.lastName)) ||
    !isObject(contact) ||
    !isString(contact.email) ||
    !isString(contact.phone) ||
    !isString(value.requests) ||
    (value.payment !== 'now' && value.payment !== 'at-hotel') ||
    !isAmount(value.total) ||
    !cancellation
  )
    return null

  const booking: Booking = {
    id: value.id,
    createdAt: value.createdAt,
    status: value.status,
    hotelId: value.hotelId,
    roomId: value.roomId,
    rateId: value.rateId,
    checkIn: value.checkIn,
    checkOut: value.checkOut,
    guests: { adults: guests.adults, children: guests.children, rooms: guests.rooms },
    roomGuests: (roomGuests as Shape[]).map((g) => ({
      firstName: g.firstName as string,
      lastName: g.lastName as string,
    })),
    contact: { email: contact.email, phone: contact.phone },
    requests: value.requests,
    payment: value.payment,
    cardLast4: isString(value.cardLast4) && /^\d{4}$/.test(value.cardLast4) ? value.cardLast4 : null,
    total: value.total,
    cancellation,
  }
  if (isString(value.cancelledAt)) booking.cancelledAt = value.cancelledAt
  if (isAmount(value.cancellationFee)) booking.cancellationFee = value.cancellationFee
  return booking
}

export const bookingsStore = createStore<Booking[]>('ostrovok:v1:bookings', [], (value) =>
  Array.isArray(value) ? value.map(toStoredBooking).filter((b): b is Booking => b !== null) : null,
)

/** Adds a booking or replaces the one with the same id. */
export function saveBooking(booking: Booking) {
  const stored = toStoredBooking(booking)
  if (!stored) throw new Error('Invalid booking')
  bookingsStore.update((list) =>
    list.some((b) => b.id === stored.id) ? list.map((b) => (b.id === stored.id ? stored : b)) : [stored, ...list],
  )
}

export const findBooking = (bookings: Booking[], id: string) => bookings.find((b) => b.id === id)
