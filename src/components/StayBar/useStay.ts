'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { addDays, todayIso } from '../../lib/dates'
import { getDestination, type Hotel } from '../../lib/catalog'
import {
  DEFAULT_GUESTS,
  parseStayParams,
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
  /** Guests of the stay, or the default couple without dates. */
  guests: Guests
  /** Replaces the address (no new history entry); the first call without dates starts from tomorrow. */
  setStay: (next: Partial<Stay>) => void
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

  const setStay = useCallback(
    (next: Partial<Stay>) => {
      const tomorrow = addDays(todayIso(), 1)
      const base: Stay = stay ?? { checkIn: tomorrow, checkOut: addDays(tomorrow, 1), guests: DEFAULT_GUESTS }
      const merged = setStayParams(new URLSearchParams(params), { ...base, ...next })
      router.replace(`${pathname}?${merged}`, { scroll: false })
    },
    [stay, params, pathname, router],
  )

  return { stay, error, guests: stay?.guests ?? DEFAULT_GUESTS, setStay }
}
