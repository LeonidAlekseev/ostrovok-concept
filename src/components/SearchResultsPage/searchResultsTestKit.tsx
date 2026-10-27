import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { nightsBetween } from '../../lib/dates'
import { NARROW, setScreen, WIDE } from '../../test/screen'
import { resetSearchView } from './searchView'
import { SearchResultsPage } from './SearchResultsPage'

// The shared setup of the SearchResultsPage tests: import it before the page, its mocks must be in place first.

// The count tests need an exact number of hotels: a set of them replaces the catalogue when it is given.
const fetched = vi.hoisted(() => ({ hotels: null as unknown[] | null }))
vi.mock('../../hooks/useHotels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useHotels')>()
  return {
    ...actual,
    fetchHotels: vi.fn((query: Parameters<typeof actual.fetchHotels>[0]) =>
      fetched.hotels
        ? Promise.resolve(fetched.hotels as Awaited<ReturnType<typeof actual.fetchHotels>>)
        : actual.fetchHotels(query),
    ),
  }
})

// The demo search waits DEMO_SEARCH_MS at least (src/lib/results.test.ts holds that to account with fake timers):
// here it answers as soon as the hotels are loaded, so no test pays the delay in real time.
vi.mock('../../lib/results', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/results')>()
  return {
    ...actual,
    runDemoSearch: async (...[query, target, hotels]: Parameters<typeof actual.runDemoSearch>) => ({
      query,
      target,
      nights: nightsBetween(query.checkIn, query.checkOut),
      hotels: await hotels,
    }),
  }
})

// The page reads the URL through Next's hooks; here they read jsdom's location and, like Next,
// follow `pushState`, `replaceState` and "Назад".
export const push = vi.fn()
export const replace = vi.fn()
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react')
  const subscribe = (onChange: () => void) => {
    window.addEventListener('popstate', onChange)
    window.addEventListener('test:urlchange', onChange)
    return () => {
      window.removeEventListener('popstate', onChange)
      window.removeEventListener('test:urlchange', onChange)
    }
  }
  return {
    useSearchParams: () =>
      new URLSearchParams(
        useSyncExternalStore(
          subscribe,
          () => window.location.search,
          () => '',
        ),
      ),
    usePathname: () => window.location.pathname,
    useRouter: () => ({ push, replace }),
  }
})
for (const method of ['pushState', 'replaceState'] as const) {
  const native = window.history[method].bind(window.history)
  window.history[method] = (...args: Parameters<History['pushState']>) => {
    native(...args)
    window.dispatchEvent(new Event('test:urlchange'))
  }
}

// jsdom has no WebGL: a stand-in map that loads (or fails) on the next tick and places markers in its container,
// with MapLibre's compact attribution: the "i" button toggles the shown text.
const mapMock = vi.hoisted(() => ({
  fail: false,
  options: [] as unknown[],
  last: null as { fire(type: string): void } | null,
  /** The zoom the map reports: far enough by default for every hotel to have its own marker. */
  zoom: 18,
  center: { lng: 14.42, lat: 50.08 },
  eased: [] as unknown[],
  fitted: 0,
}))
vi.mock('maplibre-gl', () => {
  type Handler = () => void
  class Map {
    container: HTMLElement
    handlers: Record<string, Handler[]> = {}
    constructor(options: { container: HTMLElement; attributionControl?: unknown }) {
      this.container = options.container
      mapMock.options.push(options)
      mapMock.last = this
      const attribution = document.createElement('details')
      attribution.className = 'maplibregl-ctrl-attrib maplibregl-compact maplibregl-compact-show'
      const button = document.createElement('summary')
      button.className = 'maplibregl-ctrl-attrib-button'
      button.addEventListener('click', () => attribution.classList.toggle('maplibregl-compact-show'))
      const inner = document.createElement('div')
      inner.className = 'maplibregl-ctrl-attrib-inner'
      inner.innerHTML =
        (options.attributionControl as { customAttribution?: string } | undefined)?.customAttribution ?? ''
      attribution.append(button, inner)
      this.container.append(attribution)
      setTimeout(() => this.fire(mapMock.fail ? 'error' : 'load'))
    }
    on(type: string, handler: Handler) {
      ;(this.handlers[type] ??= []).push(handler)
      return this
    }
    once(type: string, handler: Handler) {
      const once = () => {
        this.handlers[type] = this.handlers[type].filter((h) => h !== once)
        handler()
      }
      return this.on(type, once)
    }
    fire(type: string) {
      this.handlers[type]?.forEach((h) => h())
    }
    getContainer() {
      return this.container
    }
    getZoom() {
      return mapMock.zoom
    }
    getCenter() {
      return mapMock.center
    }
    easeTo(options: unknown) {
      mapMock.eased.push(options)
    }
    fitBounds() {
      mapMock.fitted++
    }
    remove() {}
  }
  class Popup {
    content: HTMLElement | null = null
    setDOMContent(content: HTMLElement) {
      this.content = content
      return this
    }
    setLngLat() {
      return this
    }
    addTo(map: Map) {
      map.container.append(this.content!)
      return this
    }
    remove() {
      this.content?.remove()
    }
  }
  class Marker {
    element: HTMLElement
    constructor({ element }: { element: HTMLElement }) {
      this.element = element
    }
    setLngLat() {
      return this
    }
    addTo(map: Map) {
      map.container.append(this.element)
      return this
    }
    remove() {
      this.element.remove()
    }
  }
  class LngLatBounds {
    extend() {
      return this
    }
  }
  return { Map, Marker, Popup, LngLatBounds, setWorkerUrl: () => {} }
})

// Every test mounts the whole results page in jsdom and queries it by role (each query computes the style of every
// element): 0.3-1.3 s alone, several times that on a busy machine. The default 5 s is not enough for the file.
vi.setConfig({ testTimeout: 20_000 })

export const NOW = new Date(2026, 9, 19, 12)
export const STAY = 'checkin=2026-10-20&checkout=2026-10-23&adults=2&rooms=1'
export const PRAGUE = `destination=prague&${STAY}`

/**
 * Mounts the results of `search` in a new entry of the history; `back` returns to the current entry instead, as
 * "Назад" from a hotel page does: the entry keeps its state.
 */
export function open(search: string, { desktop = false, reducedMotion = false, back = false } = {}) {
  window.history.replaceState(back ? window.history.state : null, '', `/search?${search}`)
  setScreen(desktop ? WIDE : NARROW, { reducedMotion })
  return render(<SearchResultsPage />)
}

/** Waits for the demo search to finish. */
export const results = () =>
  waitFor(() => expect(document.body.textContent).toMatch(/Найдено \d+|Ничего не нашлось/), { timeout: 10_000 })
// The markers are buttons labelled with the name and the price; a role query would compute the style of every element.
export const markerButtons = () =>
  Array.from(document.querySelectorAll<HTMLElement>('button[aria-label]')).filter((b) =>
    /, [\d\s]+₽$/.test(b.getAttribute('aria-label')!),
  )
export const markers = async () => {
  await waitFor(() => expect(markerButtons().length).toBeGreaterThan(0), { timeout: 10_000 })
  return markerButtons()
}
// Role queries compute the style of every element to see what is hidden: the cards are plain `article`s.
export const cards = () => Array.from(document.querySelectorAll<HTMLElement>('article'))
export const nameOf = (card: HTMLElement) => card.querySelector('h1, h2, h3, h4, h5, h6')!.textContent!
// Base UI keeps the thumbs invisible until it measures the track, which jsdom never lays out, so their
// names are not computed: the thumb is found by its label.
export const slider = (name: string) => {
  const thumb = screen.getAllByRole('slider', { hidden: true }).find((s) => s.getAttribute('aria-label') === name)
  if (!thumb) throw new Error(`No slider "${name}"`)
  return thumb
}
export const cardNames = () => cards().map(nameOf)
// The regular price comes before the GURU one.
export const priceOf = (card: HTMLElement) => within(card).getAllByText(/^[\d\s]+₽$/)[0].textContent!
export const prices = () => cards().map((card) => Number(priceOf(card).replace(/\D/g, '')))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  mapMock.fail = false
  mapMock.options = []
  mapMock.zoom = 18
  mapMock.eased = []
  mapMock.fitted = 0
  resetSearchView()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  push.mockClear()
  replace.mockClear()
})

export { fetched, mapMock }
