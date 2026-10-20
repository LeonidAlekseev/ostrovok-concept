'use client'

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { LoaderCircle, SlidersHorizontal } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { useHotelSearch } from '../../hooks/useHotelSearch'
import { useToday } from '../../hooks/useToday'
import { formatDateRange, nightsBetween } from '../../lib/dates'
import { countRu, guestsLabel } from '../../lib/format'
import {
  applyFilters,
  countFilters,
  FILTER_PARAMS,
  NO_FILTERS,
  parseFilters,
  runDemoSearch,
  setFilterParams,
  SORTS,
  type Filters,
  type SearchResult,
  type Sort,
} from '../../lib/results'
import {
  fromSearchParams,
  resolveTarget,
  validateSearch,
  withStartDates,
  type SearchErrors,
  type SearchQuery,
  type SearchTarget,
} from '../../lib/search'
import { SearchForm } from '../SearchForm/SearchForm'
import { FiltersPanel } from './FiltersPanel'
import { ResultTile } from './ResultTile'
import { MapUnavailable } from './MapUnavailable'

// MapLibre is loaded only here and only in the browser; a failed chunk load reads as an unavailable map.
const SearchMap = dynamic(() => import('./SearchMap').catch(() => ({ default: MapUnavailable })), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-muted" aria-hidden />,
})

const cardId = (hotelId: string) => `hotel-${hotelId}`

type Status = { state: 'loading' } | { state: 'done'; result: SearchResult } | { state: 'error'; message: string }

const pageClass = 'mx-auto flex w-full max-w-(--page-max) flex-1 flex-col gap-4 px-(--page-x) pt-2 pb-12'

function Searching() {
  return (
    <p className="flex items-center gap-2 text-muted-foreground">
      <LoaderCircle className="animate-[spin_0.9s_linear_infinite]" size={18} aria-hidden />
      Ищем варианты…
    </p>
  )
}

/** Shown while the URL is not read yet: the page is prerendered without its query. */
export function SearchResultsFallback() {
  return (
    <main className={pageClass}>
      <div aria-live="polite">
        <Searching />
      </div>
    </main>
  )
}

const DESKTOP = '(min-width: 64rem)'
const subscribeDesktop = (onChange: () => void) => {
  const query = window.matchMedia?.(DESKTOP)
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}
/** `lg` and wider: the list and the map side by side. */
const useDesktop = () =>
  useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia?.(DESKTOP).matches ?? false,
    () => false,
  )

/** The results page `/search`: reads the query, filters and sorting from the URL. */
export function SearchResultsPage() {
  const params = useSearchParams()
  const today = useToday()
  // The query part of the URL; the filters change without a new search.
  const request = useMemo(() => {
    const next = new URLSearchParams(params.toString())
    for (const name of FILTER_PARAMS) next.delete(name)
    return next.toString()
  }, [params])
  const query = useMemo(() => withStartDates(fromSearchParams(new URLSearchParams(request)), today), [request, today])

  if (!today) return <SearchResultsFallback />
  const errors = validateSearch(query, today)
  const target = resolveTarget(query.destination)
  if (Object.keys(errors).length > 0 || !target) return <InvalidQuery key={request} query={query} errors={errors} />
  return <Results key={request} query={query} target={target} initialFilters={parseFilters(params)} />
}

function EditSearch({ query, errors }: { query: SearchQuery; errors?: SearchErrors }) {
  const search = useHotelSearch({ query, errors })
  const destinationRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  return (
    <div className="rounded-2xl bg-card p-[clamp(14px,3.6vw,22px)] shadow-(--shadow-card)">
      <SearchForm search={search} destinationRef={destinationRef} submitRef={submitRef} />
    </div>
  )
}

function InvalidQuery({ query, errors }: { query: SearchQuery; errors: SearchErrors }) {
  return (
    <main className={pageClass}>
      <h1 className="text-title font-bold tracking-[-0.02em]">Поиск отелей</h1>
      <p className="text-muted-foreground">Проверьте параметры поиска.</p>
      <EditSearch query={query} errors={errors} />
    </main>
  )
}

interface ResultsProps {
  query: SearchQuery
  target: SearchTarget
  initialFilters: Filters
}

function Results({ query, target, initialFilters }: ResultsProps) {
  const [status, setStatus] = useState<Status>({ state: 'loading' })
  const [filters, setFilters] = useState(initialFilters)
  const [editing, setEditing] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [view, setView] = useState<'list' | 'map'>('list')
  const [activeId, setActiveId] = useState<string | null>(null)
  const scrollTo = useRef<string | null>(null)
  const desktop = useDesktop()
  const sortId = useId()

  useEffect(() => {
    const controller = new AbortController()
    runDemoSearch(query, target, controller.signal).then(
      (result) => setStatus({ state: 'done', result }),
      (error: unknown) => {
        if (controller.signal.aborted) return
        setStatus({ state: 'error', message: error instanceof Error ? error.message : 'Не удалось выполнить поиск' })
      },
    )
    return () => controller.abort()
  }, [query, target])

  const result = status.state === 'done' ? status.result : null
  const items = useMemo(() => (result ? applyFilters(result.hotels, filters) : []), [result, filters])
  const mapHotels = useMemo(
    () =>
      items.map(({ hotel, rate }) => ({
        id: hotel.id,
        name: hotel.name,
        lat: hotel.lat,
        lon: hotel.lon,
        price: rate.pricePerNight,
      })),
    [items],
  )

  // A marker click scrolls its card into view once the list is shown.
  useEffect(() => {
    const id = scrollTo.current
    if (!id || view !== 'list') return
    scrollTo.current = null
    document.getElementById(cardId(id))?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [activeId, view])

  /** Filters and sorting go to the URL without a new history entry. */
  const updateFilters = (next: Filters) => {
    setFilters(next)
    const url = new URLSearchParams(window.location.search)
    window.history.replaceState(null, '', `?${setFilterParams(url, next)}`)
  }

  const selectFromMap = (id: string) => {
    scrollTo.current = id
    setActiveId(id)
    setView('list')
  }

  const title =
    target.kind === 'destination' ? `${target.destination.name}, ${target.destination.country}` : target.title
  const nights = nightsBetween(query.checkIn, query.checkOut)
  const filterCount = countFilters(filters)

  return (
    <main className={pageClass}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title font-bold tracking-[-0.02em]">{title}</h1>
          <p className="text-muted-foreground">
            {formatDateRange(query.checkIn, query.checkOut)} · {countRu(nights, ['ночь', 'ночи', 'ночей'])} ·{' '}
            {guestsLabel(query.guests)}
          </p>
        </div>
        <Button variant="outline" aria-expanded={editing} onClick={() => setEditing((on) => !on)}>
          Изменить поиск
        </Button>
      </div>
      {editing && <EditSearch query={query} />}

      <div aria-live="polite">
        {status.state === 'loading' && <Searching />}
        {status.state === 'error' && <p className="text-sm text-destructive">{status.message}</p>}
        {result && (
          <p className="text-muted-foreground">
            {items.length > 0 ? `Найдено ${countRu(items.length, ['отель', 'отеля', 'отелей'])}` : 'Ничего не нашлось'}
          </p>
        )}
      </div>

      {result && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="lg:hidden"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal aria-hidden />
              Фильтры{filterCount > 0 && ` (${filterCount})`}
            </Button>
            <label htmlFor={sortId} className="sr-only">
              Сортировка
            </label>
            <NativeSelect
              id={sortId}
              value={filters.sort}
              onChange={(e) => updateFilters({ ...filters, sort: e.target.value as Sort })}
            >
              {Object.entries(SORTS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <div className="ml-auto flex gap-1 rounded-full bg-muted p-1 lg:hidden" role="group" aria-label="Вид">
              {(['list', 'map'] as const).map((v) => (
                <Button
                  key={v}
                  size="sm"
                  shape="pill"
                  variant={view === v ? 'default' : 'ghost'}
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                >
                  {v === 'list' ? 'Список' : 'Карта'}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_minmax(0,1fr)]">
            <aside
              aria-label="Фильтры"
              className={cn('lg:col-start-1 lg:row-start-1', !filtersOpen && 'max-lg:hidden')}
            >
              <FiltersPanel filters={filters} onChange={updateFilters} />
            </aside>

            <section
              aria-label="Отели"
              className={cn(
                'flex flex-col gap-3 lg:col-start-1 lg:row-start-2 xl:col-start-2 xl:row-start-1',
                view === 'map' && 'max-lg:hidden',
              )}
            >
              {items.length === 0 ? (
                <div className="flex flex-col items-start gap-3 rounded-2xl bg-card p-5 shadow-(--shadow-card)">
                  <p>Попробуйте изменить или сбросить фильтры.</p>
                  <Button onClick={() => updateFilters({ ...NO_FILTERS, sort: filters.sort })}>Сбросить фильтры</Button>
                </div>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {items.map((item) => (
                    <li key={item.hotel.id}>
                      <ResultTile
                        id={cardId(item.hotel.id)}
                        item={item}
                        stay={query}
                        nights={nights}
                        active={item.hotel.id === activeId}
                        onActivate={setActiveId}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {(desktop || view === 'map') && (
              <div className="h-[70dvh] overflow-hidden rounded-2xl shadow-(--shadow-card) lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[calc(100dvh-2rem)] xl:col-start-3">
                <SearchMap hotels={mapHotels} activeId={activeId} onSelect={selectFromMap} />
              </div>
            )}
          </div>
        </>
      )}
    </main>
  )
}
