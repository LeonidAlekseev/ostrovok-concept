'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { List, LoaderCircle, MapPin, SlidersVertical } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { useHotelSearch } from '../../hooks/useHotelSearch'
import { useToday } from '../../hooks/useToday'
import { fetchHotels } from '../../hooks/useHotels'
import { countRu } from '../../lib/format'
import {
  applyFilters,
  countFilters,
  FILTER_PARAMS,
  NO_FILTERS,
  PAGE_PARAM,
  PAGE_SIZE,
  pageCount,
  parseFilters,
  parsePage,
  priceBounds,
  runDemoSearch,
  setFilterParams,
  targetDestinations,
  type Filters,
  type SearchResult,
} from '../../lib/results'
import {
  fromSearchParams,
  parseSelection,
  resolveTarget,
  setStayParams,
  validateSearch,
  withStartDates,
  type SearchErrors,
  type SearchQuery,
  type SearchTarget,
  type Selection,
  type Stay,
} from '../../lib/search'
import { useDestinations } from '../Catalog/useDestinations'
import { SearchForm } from '../SearchForm/SearchForm'
import { FiltersPanel } from './FiltersPanel'
import { FiltersSheet } from './FiltersSheet'
import { Pagination } from './Pagination'
import { ResultTile } from './ResultTile'
import { useHotelierHotels } from './useHotelierHotels'
import { MapUnavailable, SEARCH_MAP_HINT } from '@/components/MapUnavailable/MapUnavailable'
import {
  entryState,
  readSearchView,
  saveCamera,
  saveOpened,
  saveScroll,
  saveView,
  searchViewKey,
  useSearchView,
} from './searchView'

// MapLibre is loaded only here and only in the browser; a failed chunk load reads as an unavailable map.
const SearchMap = dynamic(
  () => import('./SearchMap').catch(() => ({ default: () => <MapUnavailable hint={SEARCH_MAP_HINT} /> })),
  {
    ssr: false,
    loading: () => <div className="size-full animate-pulse bg-muted" aria-hidden />,
  },
)

/** The title of the blank search; its hotels are those of every destination, see `top`. */
const TOP_TITLE = 'Лучшие по оценкам гостей'
const TOP_TARGET: Selection = { kind: 'selection', hotels: [], title: TOP_TITLE }

/** A hotel of an older link to the results, `?hotel=<id>`: its page opens in place of the results. */
const HOTEL_PARAM = 'hotel'

/** The hotel page with the dates and guests of the search. */
const hotelHref = (id: string, stay: Stay) => `/hotels/${id}?${setStayParams(new URLSearchParams(), stay)}`

type Status = { state: 'loading' } | { state: 'done'; result: SearchResult } | { state: 'error'; message: string }

const pageClass =
  'mx-auto flex w-full max-w-(--page-max) 3xl:max-w-(--page-max-wide) flex-1 flex-col gap-4 px-(--page-x) pt-2 pb-12'

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
const isDesktop = () => window.matchMedia?.(DESKTOP).matches ?? false
const subscribeDesktop = (onChange: () => void) => {
  const query = window.matchMedia?.(DESKTOP)
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}
/** `lg` and wider: the list and the map side by side. */
const useDesktop = () => useSyncExternalStore(subscribeDesktop, isDesktop, () => false)

/**
 * The results page `/search`: reads the query, filters and sorting from the URL. The query is a destination or
 * a scenario, or the hotels of a selection (`?hotels=a,b&from=vibe&pick=…`, see `selectionHref`).
 */
export function SearchResultsPage() {
  const params = useSearchParams()
  const today = useToday()
  const destinations = useDestinations()
  // The query part of the URL; the filters and the page change without a new search.
  const request = useMemo(() => {
    const next = new URLSearchParams(params.toString())
    for (const name of [...FILTER_PARAMS, PAGE_PARAM, HOTEL_PARAM]) next.delete(name)
    return next.toString()
  }, [params])
  const query = useMemo(
    () => withStartDates(fromSearchParams(new URLSearchParams(request), destinations), today),
    [request, today, destinations],
  )
  const selection = useMemo(() => parseSelection(new URLSearchParams(request)), [request])

  if (!today) return <SearchResultsFallback />
  // Opened from the menu or the home page: a blank form, its errors only after a submit, and the best rated hotels.
  if (!request) {
    const filters = parseFilters(params)
    // The blank search lists the best rated first, unless the address asks for another sorting.
    const sort = params.get('sort') ? filters.sort : 'rating'
    return (
      <Results
        key="top"
        query={query}
        target={TOP_TARGET}
        initialFilters={{ ...filters, sort }}
        hotelId={params.get(HOTEL_PARAM)}
        top
      />
    )
  }
  const errors = validateSearch(query, today, destinations)
  // A selection has its hotels instead of a destination.
  if (selection) delete errors.destination
  const target = selection ?? resolveTarget(query.destination, destinations)
  if (Object.keys(errors).length > 0 || !target) return <QueryForm key={request} query={query} errors={errors} />
  return (
    <Results
      key={request}
      query={query}
      target={target}
      initialFilters={parseFilters(params)}
      hotelId={params.get(HOTEL_PARAM)}
    />
  )
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

/** The form alone: a blank search, or an invalid query of the URL with its errors. */
function QueryForm({ query, errors }: { query: SearchQuery; errors?: SearchErrors }) {
  return (
    <main className={pageClass}>
      <h1 className="text-title font-bold tracking-[-0.02em]">Поиск отелей</h1>
      {errors && <p className="text-muted-foreground">Проверьте параметры поиска.</p>}
      <EditSearch query={query} errors={errors} />
    </main>
  )
}

interface ResultsProps {
  query: SearchQuery
  target: SearchTarget | Selection
  initialFilters: Filters
  /** The hotel of an older link, opened in place of the results; an unknown id is ignored. */
  hotelId: string | null
  /** A blank search: the visible hotels of every destination under an empty form. */
  top?: boolean
}

function Results({ query, target, initialFilters, hotelId, top = false }: ResultsProps) {
  const params = useSearchParams()
  const router = useRouter()
  const hotelierHotels = useHotelierHotels()
  const [status, setStatus] = useState<Status>({ state: 'loading' })
  const [filters, setFilters] = useState(initialFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const desktop = useDesktop()
  // The list or the map, the camera, the scroll and the hotel opened live outside the page, by the entry of the
  // history: "Назад" from a hotel page returns to them. The key follows the filters of this render, not the URL that
  // Next updates a moment later; it leaves out the page, so the map keeps its camera from page to page.
  const viewKey = searchViewKey(setFilterParams(new URLSearchParams(params.toString()), filters), [
    PAGE_PARAM,
    HOTEL_PARAM,
  ])
  const kept = useSearchView(viewKey)
  const view = kept?.view ?? 'list'
  // What "Назад" restores once, when the results show: the scroll and the hotel opened from them.
  const [returned] = useState(() => readSearchView(viewKey))
  const [activeId, setActiveId] = useState<string | null>(returned?.openedId ?? null)

  const destinations = useDestinations()
  const result = status.state === 'done' ? status.result : null
  // The opened hotel is one of the results: the browser has only the hotels of the searched cities or the selection.
  const openedHotel = hotelId ? result?.hotels.find((h) => h.id === hotelId) : undefined

  // A hotel is a page of its own: an older link with the hotel opens it in place of the results.
  useEffect(() => {
    if (openedHotel) router.replace(hotelHref(openedHotel.id, query))
  }, [openedHotel, query, router])

  useEffect(() => {
    const controller = new AbortController()
    const hotels = fetchHotels(
      top
        ? { destinations: destinations.map((d) => d.id) }
        : target.kind === 'selection'
          ? { ids: target.hotels }
          : { destinations: targetDestinations(target, destinations).map((d) => d.id) },
    )
    runDemoSearch(query, target, hotels, controller.signal).then(
      (result) => setStatus({ state: 'done', result }),
      (error: unknown) => {
        if (controller.signal.aborted) return
        setStatus({ state: 'error', message: error instanceof Error ? error.message : 'Не удалось выполнить поиск' })
      },
    )
    return () => controller.abort()
  }, [query, target, destinations, top])

  const items = useMemo(() => (result ? applyFilters(result.hotels, filters, query) : []), [result, filters, query])
  const bounds = useMemo(() => (result ? priceBounds(result.hotels, query) : null), [result, query])
  const pages = pageCount(items.length)
  const page = parsePage(params, pages)
  const visible = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const resultsRef = useRef<HTMLHeadingElement>(null)

  // Back from a hotel page the results come again from the network: the scroll is put back once they are shown,
  // and only then is the scroll followed, so the short page of "Ищем варианты…" does not overwrite it.
  const restored = useRef(false)
  useLayoutEffect(() => {
    if (!result || restored.current) return
    restored.current = true
    if (returned?.scrollY) window.scrollTo({ top: returned.scrollY, behavior: 'instant' })
  }, [result, returned])
  useEffect(() => {
    if (!result) return
    let frame = 0
    const follow = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        // The hotel page scrolls to its top after the results have gone: that scroll is not theirs.
        if (window.location.pathname === '/search') saveScroll(viewKey, window.scrollY)
      })
    }
    window.addEventListener('scroll', follow, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', follow)
    }
  }, [result, viewKey])

  // After a move to another page the list starts in view and the screen reader lands on the results heading. The
  // page is known once the results are: until then `page=2` of the address reads as the first of no pages.
  const shownPage = useRef<number | null>(null)
  useEffect(() => {
    if (!result) return
    if (shownPage.current === null) shownPage.current = page
    if (shownPage.current === page) return
    shownPage.current = page
    const heading = resultsRef.current
    if (!heading) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    heading.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    heading.focus({ preventScroll: true })
  }, [page, result])

  const pageHref = (target: number) => {
    const url = new URLSearchParams(params.toString())
    if (target > 1) url.set(PAGE_PARAM, String(target))
    else url.delete(PAGE_PARAM)
    return `?${url}`
  }
  /** Moves to a page in a new history entry, so "Назад" returns to the previous one. */
  const goToPage = (target: number) => window.history.pushState(null, '', pageHref(target))

  /** Filters and sorting go to the URL without a new history entry. */
  const updateFilters = (next: Filters) => {
    setFilters(next)
    const url = setFilterParams(new URLSearchParams(window.location.search), next)
    // The new filters are a new search for the kept view: the map stays, its camera frames the new list.
    saveView(searchViewKey(url, [PAGE_PARAM, HOTEL_PARAM]), view)
    window.history.replaceState(entryState(), '', `?${url}`)
  }

  /** Remembers the hotel and the scroll before its page opens: "Назад" returns to them. */
  const leaveFor = (id: string) => saveOpened(viewKey, id)
  /** A marker of the map opens the hotel's page. */
  const openHotel = (id: string) => {
    leaveFor(id)
    router.push(hotelHref(id, query))
  }

  const title =
    target.kind === 'destination' ? `${target.destination.name}, ${target.destination.country}` : target.title
  const filterCount = countFilters(filters)

  const iconButton = 'size-14 shrink-0 rounded-2xl p-0 lg:hidden'

  return (
    <main className={pageClass}>
      {/* A selection names its source; a search names its place in the form. */}
      <h1 className={target.kind === 'selection' && !top ? 'text-title font-bold tracking-[-0.02em]' : 'sr-only'}>
        {top ? 'Поиск отелей' : title}
      </h1>
      {/* The manual search, filled from the address: a new search changes the address and the results. */}
      <EditSearch query={query} />
      {result && (
        <div className="flex justify-end gap-2 lg:hidden">
          <Button
            variant="outline"
            className={cn(iconButton, 'relative')}
            aria-haspopup="dialog"
            aria-label={filterCount > 0 ? `Фильтры, включено ${filterCount}` : 'Фильтры'}
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersVertical aria-hidden />
            {filterCount > 0 && (
              <span
                aria-hidden
                className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
              >
                {filterCount}
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            className={iconButton}
            onClick={() => saveView(viewKey, view === 'list' ? 'map' : 'list')}
            aria-label={view === 'list' ? 'Карта' : 'Список'}
          >
            {view === 'list' ? <MapPin aria-hidden /> : <List aria-hidden />}
          </Button>
        </div>
      )}

      {top && result && <h2 className="text-title font-bold tracking-[-0.02em]">{TOP_TITLE}</h2>}
      <div aria-live="polite">
        {status.state === 'loading' && <Searching />}
        {status.state === 'error' && <p className="text-sm text-destructive">{status.message}</p>}
        {result && (
          <h2 ref={resultsRef} tabIndex={-1} className="scroll-mt-4 text-muted-foreground outline-none">
            {items.length > 0
              ? `Найдено ${countRu(items.length, ['вариант', 'варианта', 'вариантов'])}`
              : 'Ничего не нашлось'}
          </h2>
        )}
      </div>

      {result && (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[1440px]:grid-cols-[15rem_minmax(0,1fr)_minmax(0,1.25fr)] 3xl:grid-cols-[15rem_minmax(0,1.6fr)_minmax(0,1fr)]">
            {desktop && (
              <aside aria-label="Фильтры" className="lg:col-start-1 lg:row-start-1">
                <FiltersPanel filters={filters} onChange={updateFilters} priceBounds={bounds ?? [0, 0]} />
              </aside>
            )}

            <section
              aria-label="Отели"
              className={cn(
                'flex flex-col gap-3 lg:col-start-1 lg:row-start-2 min-[1440px]:col-start-2 min-[1440px]:row-start-1',
                view === 'map' && 'max-lg:hidden',
              )}
            >
              {items.length === 0 ? (
                <div className="flex flex-col items-start gap-3 rounded-2xl bg-card p-5 shadow-(--shadow-card)">
                  <p>Попробуйте изменить или сбросить фильтры.</p>
                  <Button onClick={() => updateFilters({ ...NO_FILTERS, sort: filters.sort })}>Сбросить фильтры</Button>
                </div>
              ) : (
                <ul className="grid gap-3 3xl:grid-cols-2">
                  {visible.map((item) => (
                    <li key={item.hotel.id}>
                      <ResultTile
                        item={item}
                        stay={query}
                        active={item.hotel.id === activeId}
                        onActivate={setActiveId}
                        onOpen={leaveFor}
                        hotelier={hotelierHotels.get(item.hotel.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <Pagination page={page} pages={pages} hrefFor={pageHref} onNavigate={goToPage} />
            </section>

            {(desktop || view === 'map') && (
              // `svh`: the phone address bar showing and hiding while scrolling does not resize the map.
              <div className="h-[70svh] overflow-hidden rounded-2xl shadow-(--shadow-card) lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[calc(100svh-2rem)] min-[1440px]:col-start-3">
                <SearchMap
                  hotels={items}
                  activeId={activeId}
                  onActivate={setActiveId}
                  onOpen={openHotel}
                  initialCamera={kept?.camera}
                  onCameraChange={(camera) => saveCamera(viewKey, camera)}
                />
              </div>
            )}
          </div>
        </>
      )}
      <FiltersSheet
        open={filtersOpen && !desktop}
        onOpenChange={setFiltersOpen}
        filters={filters}
        onChange={updateFilters}
        total={items.length}
        priceBounds={bounds ?? [0, 0]}
      />
    </main>
  )
}
