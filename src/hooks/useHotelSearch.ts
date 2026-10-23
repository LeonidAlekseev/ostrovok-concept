import { useCallback, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useDestinations } from '../components/Catalog/useDestinations'
import { todayIso } from '../lib/dates'
import {
  DEFAULT_GUESTS,
  resolveTarget,
  toSearchParams,
  validateSearch,
  withStartDates,
  type Guests,
  type SearchErrors,
  type SearchQuery,
} from '../lib/search'
import { useToday } from './useToday'

function withoutKey(errors: SearchErrors, key: keyof SearchErrors): SearchErrors {
  const next = { ...errors }
  delete next[key]
  return next
}

// Dates the user has not picked yet stay empty; withStartDates fills them from today.
const initialQuery: SearchQuery = { destination: '', checkIn: '', checkOut: '', guests: DEFAULT_GUESTS }

interface Options {
  /** Starting form values, e.g. the query of the results page. */
  query?: SearchQuery
  /** Errors to show right away, e.g. for an invalid query in the URL. */
  errors?: SearchErrors
}

/** Form state of the search; a valid search opens the results page `/search?…`. */
export function useHotelSearch({ query: startQuery = initialQuery, errors: startErrors = {} }: Options = {}) {
  const router = useRouter()
  const today = useToday()
  const destinations = useDestinations()
  const [chosen, setChosen] = useState<SearchQuery>(startQuery)
  const query = useMemo(() => withStartDates(chosen, today), [chosen, today])
  const [errors, setErrors] = useState<SearchErrors>(startErrors)
  // True while the results page is loading after a valid search.
  const [pending, startTransition] = useTransition()

  const setDestination = useCallback((destination: string) => {
    setChosen((q) => ({ ...q, destination }))
    setErrors((e) => withoutKey(e, 'destination'))
  }, [])

  const setDates = useCallback((checkIn: string, checkOut: string) => {
    setChosen((q) => ({ ...q, checkIn, checkOut }))
    setErrors((e) => withoutKey(e, 'dates'))
  }, [])

  const setGuests = useCallback((guests: Guests) => {
    setChosen((q) => ({ ...q, guests }))
    setErrors((e) => withoutKey(e, 'guests'))
  }, [])

  /** With `anyway`, an invalid query opens the results page too: its form shows the errors at the fields. */
  const run = useCallback(
    (q: SearchQuery, anyway = false): SearchErrors => {
      // Same `today` snapshot the form used for its start dates; todayIso() only while that snapshot is empty.
      const found = validateSearch(q, today || todayIso(), destinations)
      setErrors(found)
      const target = resolveTarget(q.destination, destinations)
      if ((anyway || Object.keys(found).length === 0) && target)
        startTransition(() => router.push(`/search?${toSearchParams(q, target)}`))
      return found
    },
    [today, router, destinations],
  )

  /** Returns validation errors so the caller can move focus to the first invalid field. */
  const submit = useCallback(() => run(query), [run, query])

  /** Fills the whole form at once (the assistant's choice) and opens the results page with it. */
  const searchFor = useCallback(
    (q: SearchQuery) => {
      setChosen(q)
      return run(q, true)
    },
    [run],
  )

  return { query, errors, pending, setDestination, setDates, setGuests, submit, searchFor }
}

export type HotelSearch = ReturnType<typeof useHotelSearch>
