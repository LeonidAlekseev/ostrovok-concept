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

  const run = useCallback(async (q: SearchQuery): Promise<SearchErrors> => {
    const found = validateSearch(q, todayIso())
    setErrors(found)
    const target = resolveTarget(q.destination)
    if (Object.keys(found).length > 0 || !target) return found

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStatus({ state: 'loading' })
    try {
      const result = await runDemoSearch(q, target, controller.signal)
      window.history.replaceState(null, '', `?${result.params}`)
      setStatus({ state: 'done', result })
    } catch (error) {
      if (controller.signal.aborted) return found
      setStatus({ state: 'error', message: error instanceof Error ? error.message : 'Не удалось выполнить поиск' })
    }
    return found
  }, [])

  /** Returns validation errors so the caller can move focus to the first invalid field. */
  const submit = useCallback(() => run(query), [run, query])

  /** Fills the whole form at once (e.g. from the assistant) and searches. */
  const searchFor = useCallback(
    (q: SearchQuery) => {
      setQuery(q)
      return run(q)
    },
    [run],
  )

  return { query, errors, status, setDestination, setDates, setGuests, submit, searchFor }
}

export type HotelSearch = ReturnType<typeof useHotelSearch>
