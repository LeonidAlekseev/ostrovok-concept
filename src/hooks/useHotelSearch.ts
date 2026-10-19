import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { addDays, todayIso, type IsoDate } from '../lib/dates'
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

const subscribeNever = () => () => {}

// Dates the user has not picked yet stay empty; withStartDates fills them from today.
const initialQuery: SearchQuery = {
  destination: '',
  checkIn: '',
  checkOut: '',
  guests: { adults: 2, children: 0, rooms: 1 },
}

/** Empty dates default to tomorrow and the night after. Nothing is filled until `today` is known. */
function withStartDates(q: SearchQuery, today: IsoDate): SearchQuery {
  if (!today) return q
  const checkIn = q.checkIn || addDays(today, 1)
  return { ...q, checkIn, checkOut: q.checkOut || addDays(checkIn, 1) }
}

export function useHotelSearch() {
  // Empty on the server and during hydration, so prerendered and hydrated markup match.
  const today = useSyncExternalStore(subscribeNever, todayIso, () => '')
  const [chosen, setChosen] = useState<SearchQuery>(initialQuery)
  const query = useMemo(() => withStartDates(chosen, today), [chosen, today])
  const [errors, setErrors] = useState<SearchErrors>({})
  const [status, setStatus] = useState<SearchStatus>({ state: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

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
      setChosen(q)
      return run(q)
    },
    [run],
  )

  return { query, errors, status, setDestination, setDates, setGuests, submit, searchFor }
}

export type HotelSearch = ReturnType<typeof useHotelSearch>
