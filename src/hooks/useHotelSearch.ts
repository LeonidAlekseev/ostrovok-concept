import { useCallback, useEffect, useRef, useState } from 'react'
import { todayIso } from '../lib/dates'
import {
  resolveTarget,
  runDemoSearch,
  validateSearch,
  type Guests,
  type SearchErrors,
  type SearchQuery,
  type SearchResult,
} from '../lib/search'

export type SearchStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'done'; result: SearchResult }
  | { state: 'error'; message: string }

function withoutKey(errors: SearchErrors, key: keyof SearchErrors): SearchErrors {
  const next = { ...errors }
  delete next[key]
  return next
}

const initialQuery: SearchQuery = {
  destination: '',
  checkIn: '2026-10-17',
  checkOut: '2026-10-18',
  guests: { adults: 2, children: 0, rooms: 1 },
}

export function useHotelSearch() {
  const [query, setQuery] = useState<SearchQuery>(initialQuery)
  const [errors, setErrors] = useState<SearchErrors>({})
  const [status, setStatus] = useState<SearchStatus>({ state: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const setDestination = useCallback((destination: string) => {
    setQuery((q) => ({ ...q, destination }))
    setErrors((e) => withoutKey(e, 'destination'))
  }, [])

  const setDates = useCallback((checkIn: string, checkOut: string) => {
    setQuery((q) => ({ ...q, checkIn, checkOut }))
    setErrors((e) => withoutKey(e, 'dates'))
  }, [])

  const setGuests = useCallback((guests: Guests) => {
    setQuery((q) => ({ ...q, guests }))
    setErrors((e) => withoutKey(e, 'guests'))
  }, [])

  /** Returns validation errors so the caller can move focus to the first invalid field. */
  const submit = useCallback(async (): Promise<SearchErrors> => {
    const found = validateSearch(query, todayIso())
    setErrors(found)
    const target = resolveTarget(query.destination)
    if (Object.keys(found).length > 0 || !target) return found

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStatus({ state: 'loading' })
    try {
      const result = await runDemoSearch(query, target, controller.signal)
      window.history.replaceState(null, '', `?${result.params}`)
      setStatus({ state: 'done', result })
    } catch (error) {
      if (controller.signal.aborted) return found
      setStatus({ state: 'error', message: error instanceof Error ? error.message : 'Не удалось выполнить поиск' })
    }
    return found
  }, [query])

  return { query, errors, status, setDestination, setDates, setGuests, submit }
}

export type HotelSearch = ReturnType<typeof useHotelSearch>
