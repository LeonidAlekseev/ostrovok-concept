'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { addDays, todayIso } from '../../lib/dates'
import { getDestination, type Hotel } from '../../lib/catalog'
import {
  DEFAULT_GUESTS,
  parseGuestParams,
  parseStayParams,
  setGuestParams,
  setStayParams,
  validateSearch,
  type Guests,
  type Stay,
} from '../../lib/search'

export interface StayState {
  /** The valid stay from the address, or `null` while the dates are not chosen. */
  stay: Stay | null
  /** Why the address stay was rejected (a past check-in, too many nights…). */
  error: string | undefined
  /** Guests of the stay, or those of the address without dates; the default couple if none or invalid. */
  guests: Guests
  /** Replaces the address (no new history entry); the first call that sets one date starts from tomorrow; guests alone never add dates. */
  setStay: (next: Partial<Stay>) => void
}

const defaultStay = (guests: Guests): Stay => {
  const tomorrow = addDays(todayIso(), 1)
  return { checkIn: tomorrow, checkOut: addDays(tomorrow, 1), guests }
}

/** Dates and guests of the hotel pages, kept in the address (`checkin`, `checkout`, `adults`, `children`, `rooms`). */
export function useStay(hotel: Hotel): StayState {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  const parsed = parseStayParams(params)
  const destination = getDestination(hotel.destinationId)!.name
  const errors = parsed ? validateSearch({ destination, ...parsed }, todayIso()) : {}
  const error = errors.dates ?? errors.guests
  const stay = parsed && !error ? parsed : null

  // Without dates the address may still carry guests; they count only when they pass the limits.
  const addressGuests = parseGuestParams(params)
  const guests =
    stay?.guests ??
    (addressGuests &&
    !validateSearch({ destination, checkIn: '', checkOut: '', guests: addressGuests }, todayIso()).guests
      ? addressGuests
      : DEFAULT_GUESTS)

  const setStay = useCallback(
    (next: Partial<Stay>) => {
      const search = new URLSearchParams(params)
      // Without dates only the guests are written; the dates are the visitor's to choose.
      const merged =
        stay || next.checkIn || next.checkOut
          ? setStayParams(search, { ...(stay ?? defaultStay(guests)), ...next })
          : setGuestParams(search, next.guests ?? guests)
      router.replace(`${pathname}?${merged}`, { scroll: false })
    },
    [stay, guests, params, pathname, router],
  )

  return { stay, error, guests, setStay }
}

/** Dates and guests held by the caller (the hotel dialog): the address is left alone. */
export function useLocalStay(hotel: Hotel, stay: Stay, onChange: (next: Stay) => void): StayState {
  const destination = getDestination(hotel.destinationId)!.name
  const errors = validateSearch({ destination, ...stay }, todayIso())
  const error = errors.dates ?? errors.guests
  return { stay: error ? null : stay, error, guests: stay.guests, setStay: (next) => onChange({ ...stay, ...next }) }
}
