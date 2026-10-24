import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MEAL_LABEL } from '../../lib/catalog'
import { destinations } from '../../data/destinations'
import { fullHotelsIn } from '../../lib/catalogGenerator'
import { countRu, formatPrice } from '../../lib/format'
import { applyFilters, NO_FILTERS, priceBounds } from '../../lib/results'
import { resetSearchView } from './searchView'
import { SearchResultsPage } from './SearchResultsPage'

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

// The page reads the URL through Next's hooks; here they read jsdom's location and, like Next,
// follow `pushState`, `replaceState` and "Назад".
const push = vi.fn()
const replace = vi.fn()
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
    constructor(options: { container: HTMLElement }) {
      this.container = options.container
      mapMock.options.push(options)
      mapMock.last = this
      const attribution = document.createElement('details')
      attribution.className = 'maplibregl-ctrl-attrib maplibregl-compact maplibregl-compact-show'
      const button = document.createElement('summary')
      button.className = 'maplibregl-ctrl-attrib-button'
      button.addEventListener('click', () => attribution.classList.toggle('maplibregl-compact-show'))
      attribution.append(button)
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

const NOW = new Date(2026, 9, 19, 12)
const STAY = 'checkin=2026-10-20&checkout=2026-10-23&adults=2&rooms=1'
const PRAGUE = `destination=prague&${STAY}`

function open(search: string, { desktop = false } = {}) {
  window.history.replaceState(null, '', `/search?${search}`)
  window.matchMedia = ((query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  return render(<SearchResultsPage />)
}

/** Waits for the demo search to finish. */
const results = () => screen.findByText(/Найдено \d+|Ничего не нашлось/, {}, { timeout: 3000 })
const cards = () => screen.queryAllByRole('article')
// Base UI keeps the thumbs invisible until it measures the track, which jsdom never lays out, so their
// names are not computed: the thumb is found by its label.
const slider = (name: string) => {
  const thumb = screen.getAllByRole('slider', { hidden: true }).find((s) => s.getAttribute('aria-label') === name)
  if (!thumb) throw new Error(`No slider "${name}"`)
  return thumb
}
const cardNames = () => cards().map((card) => within(card).getByRole('heading').textContent)
// The regular price comes before the GURU one.
const priceOf = (card: HTMLElement) => within(card).getAllByText(/^[\d\s]+₽$/)[0].textContent!
const prices = () => cards().map((card) => Number(priceOf(card).replace(/\D/g, '')))

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

// search-results-page, Requirement: Страница результатов
describe('SearchResultsPage query', () => {
  it('shows the loading state, then the summary and the hotels of the city', async () => {
    open(PRAGUE)

    expect(screen.getByText('Ищем варианты…').closest('[aria-live="polite"]')).not.toBeNull()
    await results()

    expect(screen.getByRole('heading', { level: 1, name: 'Прага, Чехия' })).toBeDefined()
    expect(screen.queryByText(/3 ночи/)).toBeNull()
    expect(cards().length).toBeGreaterThanOrEqual(6)
  })

  it('shows the hotels of every destination of a scenario', async () => {
    open(`scenario=sea&${STAY}`)
    await results()

    expect(screen.getByRole('heading', { level: 1, name: 'У моря' })).toBeDefined()
    expect(cards().length).toBeGreaterThan(6)
  })

  // search-modes, Requirement: Пустая страница ручного поиска, Scenario: Открытие без параметров
  it('shows a blank search form without errors until it is submitted', async () => {
    const user = userEvent.setup()
    open('')

    const form = screen.getByRole('form', { name: 'Поиск отелей' })
    expect((within(form).getByRole('combobox', { name: 'Направление' }) as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('Укажите, куда вы хотите поехать')).toBeNull()
    expect(screen.queryByText('Проверьте параметры поиска.')).toBeNull()
    expect(screen.queryByText('Ищем варианты…')).toBeNull()

    await user.click(within(form).getByRole('button', { name: /Найти отель/ }))
    expect(screen.getByText('Укажите, куда вы хотите поехать')).toBeDefined()
    expect(push).not.toHaveBeenCalled()
  })

  it('shows the search form with the destination error for a query without a destination', () => {
    open(STAY)

    expect(screen.getByRole('form', { name: 'Поиск отелей' })).toBeDefined()
    expect(screen.getByText('Укажите, куда вы хотите поехать')).toBeDefined()
    expect(screen.queryByText('Ищем варианты…')).toBeNull()
  })

  // search-modes, Requirement: Ручная форма на странице выдачи, Scenario: Смена города
  it('shows the manual form over the results, filled from the address; a new city changes the address', async () => {
    const user = userEvent.setup()
    open(PRAGUE)
    await results()

    const form = screen.getByRole('form', { name: 'Поиск отелей' })
    expect(form.compareDocumentPosition(cards()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const destination = within(form).getByRole('combobox', { name: 'Направление' })
    expect((destination as HTMLInputElement).value).toBe('Прага')
    await user.clear(destination)
    await user.type(destination, 'Рим')
    await user.keyboard('{Escape}')
    await user.click(within(form).getByRole('button', { name: /Найти отель/ }))

    expect(push).toHaveBeenCalledWith(`/search?destination=rome&${STAY}`)
  })

  it('shows the field errors at the form without leaving the page', async () => {
    const user = userEvent.setup()
    open(PRAGUE)
    await results()

    const destination = screen.getByRole('combobox', { name: 'Направление' })
    await user.clear(destination)
    await user.click(screen.getByRole('button', { name: /Найти отель/ }))
    expect(screen.getByText('Укажите, куда вы хотите поехать')).toBeDefined()
    expect(push).not.toHaveBeenCalled()
  })
})

// search-results-page, Requirement: Карточка отеля в результатах
// search-results-page, Requirement: Счётчик результатов
describe('SearchResultsPage count', () => {
  // Prague alone has fewer hotels than the largest count, so the pool takes every destination.
  const pool = destinations.flatMap(({ id }) => fullHotelsIn(id))
  const hotelsOf = (n: number) => pool.slice(0, n)
  afterEach(() => {
    fetched.hotels = null
  })

  it.each([
    [1, 'вариант'],
    [2, 'варианта'],
    [5, 'вариантов'],
    [21, 'вариант'],
  ])('counts %i hotels as "%s" in the form of the number', async (n, noun) => {
    fetched.hotels = hotelsOf(n)
    open(PRAGUE)
    const heading = await screen.findByRole('heading', { name: /^Найдено/ })

    expect(heading.textContent).toBe(`Найдено ${n} ${noun}`)
  })

  it('shows "Ничего не нашлось" instead of the count without results', async () => {
    fetched.hotels = []
    open(PRAGUE)
    await results()

    expect(screen.getByText('Ничего не нашлось')).toBeDefined()
    expect(screen.queryByText(/^Найдено/)).toBeNull()
  })
})

describe('SearchResultsPage hotel card', () => {
  it('links the hotel name to the hotel page with the same dates and guests', async () => {
    open(`destination=prague&checkin=2026-10-20&checkout=2026-10-23&adults=3&children=1&rooms=2`)
    await results()

    const card = cards()[0]
    const link = within(card).getByRole('link')
    expect(link.getAttribute('href')).toMatch(
      /^\/hotels\/prague-[a-z-]+\?checkin=2026-10-20&checkout=2026-10-23&adults=3&children=1&rooms=2$/,
    )
    expect(within(card).queryByText(/за \d* ?ноч/)).toBeNull()
    expect(within(card).getByText(/км от центра Праги/)).toBeDefined()
    expect(within(card).getByRole('button', { name: 'Добавить в избранное' })).toBeDefined()
  })

  it('shows neither the meal nor the number of reviews', async () => {
    open(PRAGUE)
    await results()

    for (const card of cards()) {
      expect(card.textContent).not.toMatch(new RegExp(Object.values(MEAL_LABEL).join('|')))
      expect(card.textContent).not.toMatch(/отзыв/)
    }
  })

  it('takes the free cancellation from the rate of the card', async () => {
    open(PRAGUE)
    await results()

    const items = applyFilters(fullHotelsIn('prague'), NO_FILTERS)
    const badges = cards().map((card) => {
      const name = within(card).getByRole('heading').textContent!
      const { rate } = items.find((item) => item.hotel.name === name)!
      const badge = within(card).queryByText('Бесплатная отмена') !== null
      expect(badge, name).toBe(rate.cancellation.kind === 'free')
      return badge
    })
    // Every Prague hotel has a free cancellation rate, yet not every cheapest rate is one.
    expect(new Set(badges)).toEqual(new Set([true, false]))
  })

  it('puts the photo above the text in every card', async () => {
    open(PRAGUE)
    await results()

    for (const card of cards()) {
      // The first block of the card holds the photo and nothing of the text.
      const top = card.firstElementChild as HTMLElement
      expect(within(top).getByRole('group', { name: 'Фото отеля' })).toBeDefined()
      expect(top.className).toMatch(/\bw-full\b/)
      expect(within(top).queryByRole('heading')).toBeNull()
    }
  })

  it('lists the hotels in one column up to 3xl (1920 px) and in two from 3xl', async () => {
    open(PRAGUE)
    await results()

    const list = screen.getByRole('region', { name: 'Отели' }).querySelector('ul')!
    expect(list.className).toMatch(/(^|\s)3xl:grid-cols-2(\s|$)/)
    expect(list.className).not.toMatch(/(^|\s)(sm|md|lg|xl|2xl):grid-cols-/)
  })

  it('widens the page and gives the list more room than the map from 3xl (1920 px)', async () => {
    open(PRAGUE)
    await results()

    const page = screen.getByRole('region', { name: 'Отели' }).closest('main')!
    expect(page.className).toMatch(/(^|\s)3xl:max-w-\(--page-max-wide\)(\s|$)/)
    const columns = screen.getByRole('region', { name: 'Отели' }).closest('.grid')!
    expect(columns.className).toMatch(/(^|\s)3xl:grid-cols-\[15rem_minmax\(0,1\.6fr\)_minmax\(0,1fr\)\](\s|$)/)
  })
})

// search-results-page, Requirement: Фильтры и сортировка
describe('SearchResultsPage filters', () => {
  it('filters by stars and sorts by price, writing both into the URL without new history entries', async () => {
    const user = userEvent.setup()
    open(PRAGUE, { desktop: true })
    await results()
    const pushState = vi.spyOn(window.history, 'pushState')

    await user.click(screen.getByRole('button', { name: '5 звёзд' }))
    expect(window.location.search).toContain('stars=5')
    expect(cards().length).toBeGreaterThan(0)
    for (const card of cards()) expect(within(card).getByLabelText('5 звёзд')).toBeDefined()

    await user.selectOptions(screen.getByLabelText('Сортировка'), 'Сначала дешевле')
    expect(window.location.search).toContain('sort=price_asc')
    expect(prices()).toEqual([...prices()].sort((a, b) => a - b))
    expect(pushState).not.toHaveBeenCalled()
  })

  it('restores the filters and the sorting from the URL', async () => {
    open(`${PRAGUE}&stars=5,4&rating=8&free_cancel=1&sort=price_desc`, { desktop: true })
    await results()

    const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed')
    expect(pressed('5 звёзд')).toBe('true')
    expect(pressed('4 звезды')).toBe('true')
    expect(pressed('3 звезды')).toBe('false')
    // The old `rating=8` is the lower end of the rating range.
    expect(slider('Рейтинг от').getAttribute('aria-valuenow')).toBe('8')
    expect(slider('Рейтинг до').getAttribute('aria-valuenow')).toBe('10')
    expect(screen.getByText('от 8 до 10')).toBeDefined()
    expect(pressed('Бесплатная отмена')).toBe('true')
    expect((screen.getByLabelText('Сортировка') as HTMLSelectElement).value).toBe('price_desc')
    expect(prices()).toEqual([...prices()].sort((a, b) => b - a))
    for (const card of cards()) expect(within(card).getByText('Бесплатная отмена')).toBeDefined()
  })

  // search-results-page, Requirement: Фильтр типа жилья и работы
  it('filters by the kind of stay, any of the chosen, and writes them into the URL', async () => {
    const user = userEvent.setup()
    open(PRAGUE, { desktop: true })
    await results()
    await user.click(screen.getByRole('button', { name: 'Хостел' }))
    await user.click(screen.getByRole('button', { name: 'Апартаменты' }))
    expect(window.location.search).toContain('types=hostel%2Capartments')
    expect(cards().length).toBeGreaterThan(0)
    for (const card of cards()) expect(within(card).getByText(/^(Хостел|Апартаменты) ·$/)).toBeDefined()
  })

  it('filters by the workspace and the Wi‑Fi speed from', async () => {
    const user = userEvent.setup()
    open(PRAGUE, { desktop: true })
    await results()
    const all = cards().length
    await user.click(screen.getByRole('button', { name: 'Рабочая зона' }))
    expect(window.location.search).toContain('workspace=1')
    await user.click(screen.getByRole('button', { name: 'Wi‑Fi от 200 Мбит/с' }))
    expect(window.location.search).toContain('wifi_min=200')
    expect(cards().length).toBeLessThan(all)
  })

  it('shows the stars as chips from 1 to 5, the meals and the free cancellation as chips too', async () => {
    open(PRAGUE, { desktop: true })
    await results()
    const aside = screen.getByRole('complementary', { name: 'Фильтры' })

    expect(within(aside).queryAllByRole('checkbox')).toHaveLength(0)
    expect(within(aside).queryAllByRole('radio')).toHaveLength(0)
    const stars = within(within(aside).getByRole('group', { name: 'Звёзды' })).getAllByRole('button')
    expect(stars.map((b) => b.getAttribute('aria-label'))).toEqual([
      '1 звезда',
      '2 звезды',
      '3 звезды',
      '4 звезды',
      '5 звёзд',
    ])
    // The first "Питание" is the meals; the amenities have a section of the same name.
    const meals = within(within(aside).getAllByRole('group', { name: 'Питание' })[0]).getAllByRole('button')
    expect(meals.map((b) => b.textContent)).toEqual(Object.values(MEAL_LABEL))
    expect(meals.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  it('narrows the guest rating with the slider "от–до" and writes both ends into the URL', async () => {
    open(PRAGUE, { desktop: true })
    await results()
    const from = slider('Рейтинг от')
    const to = slider('Рейтинг до')
    expect([from, to].map((s) => [s.getAttribute('min'), s.getAttribute('max')])).toEqual([
      ['0', '10'],
      ['0', '10'],
    ])

    fireEvent.change(from, { target: { value: '8' } })
    fireEvent.change(to, { target: { value: '9' } })
    expect(window.location.search).toContain('rating_min=8')
    expect(window.location.search).toContain('rating_max=9')
    expect(screen.getByText('от 8 до 9')).toBeDefined()
    const expected = applyFilters(fullHotelsIn('prague'), { ...NO_FILTERS, ratingMin: 8, ratingMax: 9 })
    expect(screen.getByText(/^Найдено/).textContent).toContain(String(expected.length))
    expect(expected.every(({ hotel }) => hotel.rating >= 8 && hotel.rating <= 9)).toBe(true)

    fireEvent.keyDown(from, { key: 'ArrowLeft' })
    expect(window.location.search).toContain('rating_min=7.5')
    expect(screen.getByText('от 7,5 до 9')).toBeDefined()
  })

  it('bounds the price slider by the cheapest and the dearest night of the results, its fields follow', async () => {
    open(PRAGUE, { desktop: true })
    await results()
    const [low, high] = priceBounds(fullHotelsIn('prague'), {
      checkIn: '2026-10-20',
      checkOut: '2026-10-23',
      guests: { adults: 2, children: 0, rooms: 1 },
    })
    const from = slider('Цена за ночь от')
    expect(from.getAttribute('min')).toBe(String(low))
    expect(from.getAttribute('max')).toBe(String(high))
    expect(screen.getByRole('textbox', { name: 'Цена за ночь от' }).getAttribute('placeholder')).toBe(
      `от ${formatPrice(low)}`,
    )

    fireEvent.change(from, { target: { value: String(low + 1000) } })
    expect(window.location.search).toContain(`price_min=${low + 1000}`)
    expect((screen.getByRole('textbox', { name: 'Цена за ночь от' }) as HTMLInputElement).value).toBe(
      String(low + 1000),
    )
  })

  it('keeps only the hotels with every chosen amenity, by the sections of the catalogue', async () => {
    const user = userEvent.setup()
    open(PRAGUE, { desktop: true })
    await results()
    const amenities = screen.getByRole('group', { name: 'Удобства' })
    expect(within(amenities).getByRole('group', { name: 'Парковка' })).toBeDefined()

    await user.click(within(amenities).getByRole('button', { name: 'Парковка' }))
    await user.click(within(amenities).getByRole('button', { name: 'Крытый бассейн' }))
    expect(within(amenities).getByRole('button', { name: 'Парковка' }).getAttribute('aria-pressed')).toBe('true')
    expect(new URLSearchParams(window.location.search).get('amenities')).toBe('parking,pool')

    const expected = applyFilters(fullHotelsIn('prague'), { ...NO_FILTERS, amenities: ['parking', 'pool'] })
    expect(expected.length).toBeGreaterThan(0)
    expect(screen.getByText(/^Найдено/).textContent).toContain(String(expected.length))
    expect(cardNames().sort()).toEqual(
      expected
        .slice(0, 12)
        .map(({ hotel }) => hotel.name)
        .sort(),
    )
  })

  it('shows "Ничего не нашлось" and resets the filters', async () => {
    const user = userEvent.setup()
    open(PRAGUE, { desktop: true })
    await results()
    const all = cardNames()

    await user.type(screen.getByRole('textbox', { name: 'Цена за ночь до' }), '1')
    expect(screen.getByText('Ничего не нашлось')).toBeDefined()
    expect(cards()).toHaveLength(0)

    const list = screen.getByRole('region', { name: 'Отели' })
    await user.click(within(list).getByRole('button', { name: 'Сбросить фильтры' }))
    expect(cardNames()).toEqual(all)
    expect(window.location.search).not.toContain('price_max')
  })
})

// search-results-page, Requirement: Строка поиска; Фильтры на телефоне
describe('SearchResultsPage compact bar', () => {
  const sheet = () => screen.getByRole('dialog', { name: 'Фильтры' })

  it('shows the filters and map buttons on narrow screens only, hidden from lg', async () => {
    open(PRAGUE)
    await results()

    for (const name of ['Фильтры', 'Карта']) {
      const button = screen.getByRole('button', { name })
      expect(button.className).toMatch(/(^|\s)lg:hidden(\s|$)/)
    }
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('sr-only')
  })

  it('has no filter or map buttons and keeps the panels on desktop', async () => {
    open(PRAGUE, { desktop: true })
    await results()

    expect(screen.getByRole('button', { name: 'Фильтры' }).className).toContain('lg:hidden')
    const aside = screen.getByRole('complementary', { name: 'Фильтры' })
    // The sorting is the first item of the side panel.
    expect(aside.querySelector('select')).toBe(within(aside).getByLabelText('Сортировка'))
    expect(aside.firstElementChild!.firstElementChild!.contains(within(aside).getByLabelText('Сортировка'))).toBe(true)
  })

  it('names the filters button with the number of enabled filters', async () => {
    open(`${PRAGUE}&stars=5,4&free_cancel=1`)
    await results()

    const button = screen.getByRole('button', { name: 'Фильтры, включено 2' })
    expect(button.textContent).toBe('2')
  })

  it('counts the rating range and the amenities among the enabled filters', async () => {
    open(`${PRAGUE}&rating_min=7&amenities=wifi,parking`)
    await results()

    expect(screen.getByRole('button', { name: 'Фильтры, включено 2' })).toBeDefined()
  })

  it('toggles between "Карта" and "Список" with the icon', async () => {
    const user = userEvent.setup()
    open(PRAGUE)
    await results()

    await user.click(screen.getByRole('button', { name: 'Карта' }))
    expect(screen.queryByRole('button', { name: 'Карта' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Список' }))
    expect(screen.getByRole('button', { name: 'Карта' })).toBeDefined()
    expect(screen.getByRole('region', { name: 'Отели' }).className).not.toContain('hidden')
  })

  it('applies filters at once in the bottom sheet, sorting first, and closes with "Показать N отелей"', async () => {
    const user = userEvent.setup()
    open(PRAGUE)
    await results()
    expect(screen.queryByRole('dialog')).toBeNull()
    const pushState = vi.spyOn(window.history, 'pushState')

    await user.click(screen.getByRole('button', { name: 'Фильтры' }))
    const dialog = sheet()
    expect(dialog.querySelector('select')).toBe(within(dialog).getByLabelText('Сортировка'))
    await user.click(within(dialog).getByRole('button', { name: '5 звёзд' }))

    expect(window.location.search).toContain('stars=5')
    expect(pushState).not.toHaveBeenCalled()
    // The page behind the modal sheet is hidden from assistive technology.
    const total = screen.queryAllByRole('article', { hidden: true }).length
    expect(total).toBeGreaterThan(0)
    const show = within(dialog).getByRole('button', { name: /^Показать \d+ отел/ })
    expect(show.textContent).toBe(`Показать ${total} ${total === 1 ? 'отель' : total < 5 ? 'отеля' : 'отелей'}`)

    await user.click(show)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Фильтры, включено 1' })).toBeDefined()
    for (const card of cards()) expect(within(card).getByLabelText('5 звёзд')).toBeDefined()
  })

  it('sorts from the bottom sheet', async () => {
    const user = userEvent.setup()
    open(PRAGUE)
    await results()

    await user.click(screen.getByRole('button', { name: 'Фильтры' }))
    await user.selectOptions(within(sheet()).getByLabelText('Сортировка'), 'price_asc')

    expect(window.location.search).toContain('sort=price_asc')
    expect(prices()).toEqual([...prices()].sort((a, b) => a - b))
  })
})

// search-results-page, Requirement: Карта результатов поиска
describe('SearchResultsPage map', () => {
  const markers = () => screen.findAllByRole('button', { name: /, [\d\s]+₽$/ }, { timeout: 3000 })
  const markerOf = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}, `) })

  it('shows a marker per hotel with the price of its card, without "за ночь"', async () => {
    open(`destination=prague&checkin=2026-10-20&checkout=2026-10-23&adults=3&rooms=2`, { desktop: true })
    await results()

    expect(await markers()).toHaveLength(cards().length)
    for (const card of cards()) {
      const name = within(card).getByRole('heading').textContent!
      const price = priceOf(card)
      const marker = markerOf(name)
      expect(marker.textContent).toBe(price)
      expect(marker.getAttribute('aria-label')).toBe(`${name}, ${price}`)
    }
    // The price filter keeps "Цена за ночь"; the cards and the map show no period.
    for (const name of ['Отели', 'Карта отелей'])
      expect(within(screen.getByRole('region', { name })).queryByText(/за \d* ?ноч/)).toBeNull()
  })

  it('highlights the marker of a hovered card', async () => {
    const user = userEvent.setup()
    open(PRAGUE, { desktop: true })
    await results()
    await markers()

    const card = cards()[0]
    await user.hover(card)
    expect(markerOf(within(card).getByRole('heading').textContent!).hasAttribute('data-active')).toBe(true)
  })

  it('switches between the list and the map on narrow screens', async () => {
    const user = userEvent.setup()
    open(PRAGUE)
    await results()
    expect(screen.queryByRole('region', { name: 'Карта отелей' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Карта' }))
    expect(await markers()).toHaveLength(cards().length)
    expect(screen.getByRole('region', { name: 'Отели' }).className).toContain('max-lg:hidden')
  })

  it('shows "Карта недоступна" when the map fails, and the list keeps working', async () => {
    const user = userEvent.setup()
    mapMock.fail = true
    open(PRAGUE, { desktop: true })
    await results()

    expect(await screen.findByText('Карта недоступна', {}, { timeout: 3000 })).toBeDefined()
    await user.click(screen.getByRole('button', { name: '5 звёзд' }))
    await waitFor(() => expect(window.location.search).toContain('stars=5'))
    expect(cards().length).toBeGreaterThan(0)
  })
})

// search-results-page, Requirement: Атрибуция карты
describe('SearchResultsPage map attribution', () => {
  const attribution = () => screen.getByRole('region', { name: 'Карта отелей' }).querySelector('details')!

  it('asks MapLibre for the compact attribution and folds it 5 seconds after the map loads', async () => {
    // Timers that also run on their own, so the search and the map load as usual.
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
    vi.setSystemTime(NOW)
    open(PRAGUE, { desktop: true })
    await results()
    await screen.findAllByRole('button', { name: /, [\d\s]+₽$/ }, { timeout: 3000 })

    expect(mapMock.options.at(-1)).toMatchObject({ attributionControl: { compact: true } })
    expect(attribution().classList.contains('maplibregl-compact-show')).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(4000))
    expect(attribution().classList.contains('maplibregl-compact-show')).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(attribution().classList.contains('maplibregl-compact-show')).toBe(false)
  })

  it('folds the attribution on the first interaction with the map, and the "i" shows it again', async () => {
    open(PRAGUE, { desktop: true })
    await results()
    const [marker] = await screen.findAllByRole('button', { name: /, [\d\s]+₽$/ }, { timeout: 3000 })
    expect(attribution().classList.contains('maplibregl-compact-show')).toBe(true)

    act(() => mapMock.last!.fire('mousedown'))
    expect(attribution().classList.contains('maplibregl-compact-show')).toBe(false)
    fireEvent.click(attribution().querySelector('summary')!)
    expect(attribution().classList.contains('maplibregl-compact-show')).toBe(true)
    // Only the first interaction folds it.
    act(() => mapMock.last!.fire('mousedown'))
    expect(attribution().classList.contains('maplibregl-compact-show')).toBe(true)
    expect(marker).toBeDefined()
  })
})

// search-results-page, Requirement: Краткая карточка на карте
describe('SearchResultsPage map preview', () => {
  const markers = () => screen.findAllByRole('button', { name: /, [\d\s]+₽$/ }, { timeout: 3000 })

  it('shows the short card of a hovered marker and highlights its card in the list', async () => {
    const user = userEvent.setup()
    open(PRAGUE, { desktop: true })
    await results()
    const [, marker] = await markers()
    const name = marker.getAttribute('aria-label')!.split(',')[0]
    const map = screen.getByRole('region', { name: 'Карта отелей' })

    await user.hover(marker)
    const preview = document.getElementById(marker.getAttribute('aria-describedby')!)!
    expect(map.contains(preview)).toBe(true)
    expect(within(preview).getByText(name)).toBeDefined()
    expect(within(preview).getByText(/^[\d\s]+₽$/).textContent).toBe(marker.textContent)
    expect(preview.textContent).not.toMatch(/(^|\s)от \d/)
    expect(within(preview).getByRole('img', { name: /звезд|звёзд/ })).toBeDefined()
    expect(within(preview).getByText('Оценка гостей')).toBeDefined()
    expect(within(preview).getAllByRole('img').length).toBeGreaterThan(1)
    expect(within(preview).queryByText(/за ночь|ноч/)).toBeNull()
    expect(screen.getByRole('heading', { name }).closest('article')!.hasAttribute('data-active')).toBe(true)

    await user.unhover(marker)
    expect(marker.hasAttribute('aria-describedby')).toBe(false)
    expect(map.contains(preview)).toBe(false)
    expect(screen.getByRole('heading', { name }).closest('article')!.hasAttribute('data-active')).toBe(false)
  })

  it('shows the short card of a keyboard-focused marker and hides it on Esc', async () => {
    const user = userEvent.setup()
    open(PRAGUE, { desktop: true })
    await results()
    const [marker] = await markers()

    // jsdom has no focus-visible heuristics: here every focused element shows its focus.
    const matches = Element.prototype.matches
    const focusVisible = vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector) {
      return selector === ':focus-visible' ? this === document.activeElement : matches.call(this, selector)
    })

    act(() => marker.focus())
    expect(marker.getAttribute('aria-describedby')).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(marker.hasAttribute('aria-describedby')).toBe(false)
    focusVisible.mockRestore()
  })
})

// search-results-page, Requirement: Окно отеля с карты
describe('SearchResultsPage hotel dialog', () => {
  const markers = () => screen.findAllByRole('button', { name: /, [\d\s]+₽$/ }, { timeout: 3000 })
  const hotel = fullHotelsIn('prague')[0]

  it('opens the hotel of a pressed marker in a dialog with the dates of the search, without scrolling the list', async () => {
    const user = userEvent.setup()
    open(PRAGUE, { desktop: true })
    await results()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const [, marker] = await markers()
    const name = marker.getAttribute('aria-label')!.split(',')[0]
    const id = fullHotelsIn('prague').find((h) => h.name === name)!.id

    await user.click(marker)

    const dialog = await screen.findByRole('dialog', { name })
    expect(new URLSearchParams(window.location.search).get('hotel')).toBe(id)
    expect(within(dialog).getByRole('heading', { level: 2, name })).toBeDefined()
    expect(within(dialog).queryByRole('main')).toBeNull()
    expect(within(dialog).getByRole('heading', { name: 'Номера' })).toBeDefined()
    expect(within(dialog).getByRole('link', { name: 'Открыть страницу отеля' }).getAttribute('href')).toBe(
      `/hotels/${id}?${STAY}`,
    )
    // A room choice goes on with the dates of the search.
    expect(
      within(dialog)
        .getAllByRole('link', { name: /^Выбрать: / })[0]
        .getAttribute('href'),
    ).toMatch(new RegExp(`^/hotels/${id}/rooms\\?${STAY}#`))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('closes on "Назад" and keeps the results', async () => {
    const user = userEvent.setup()
    open(PRAGUE, { desktop: true })
    await results()
    const before = cardNames()
    const [marker] = await markers()

    await user.click(marker)
    expect(await screen.findByRole('dialog')).toBeDefined()
    act(() => window.history.back())

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(window.location.search).not.toContain('hotel=')
    expect(cardNames()).toEqual(before)
  })

  it('closes with "Закрыть"', async () => {
    const user = userEvent.setup()
    open(PRAGUE, { desktop: true })
    await results()
    await user.click((await markers())[0])

    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Закрыть' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(window.location.search).not.toContain('hotel='))
  })

  it('opens the dialog right away from a link with the hotel, and closes it in place', async () => {
    const user = userEvent.setup()
    open(`${PRAGUE}&hotel=${hotel.id}`, { desktop: true })
    await results()

    const dialog = await screen.findByRole('dialog', { name: hotel.name })
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(window.location.search).toBe(`?${PRAGUE}`)
    expect(cards().length).toBeGreaterThan(0)
  })

  it('starts the dialog with the start dates of a search without dates', async () => {
    open(`destination=prague&hotel=${hotel.id}`, { desktop: true })
    await results()

    const dialog = await screen.findByRole('dialog', { name: hotel.name })

    expect(within(dialog).getByRole('link', { name: 'Открыть страницу отеля' }).getAttribute('href')).toBe(
      `/hotels/${hotel.id}?checkin=2026-10-20&checkout=2026-10-21&adults=2&rooms=1`,
    )
    expect(within(dialog).queryByText('Выберите даты')).toBeNull()
  })

  it('changes the stay in the dialog only: the address and the list stay and the links follow', async () => {
    const user = userEvent.setup()
    open(`${PRAGUE}&hotel=${hotel.id}`, { desktop: true })
    await results()
    const before = cardNames()
    const search = window.location.search
    const dialog = await screen.findByRole('dialog', { name: hotel.name })

    await user.click(within(dialog).getByRole('button', { name: /^Гости: / }))
    await user.click(await screen.findByRole('button', { name: 'Взрослые: увеличить' }))

    const changed = `/hotels/${hotel.id}?checkin=2026-10-20&checkout=2026-10-23&adults=3&rooms=1`
    expect(within(dialog).getByRole('link', { name: 'Открыть страницу отеля' }).getAttribute('href')).toBe(changed)
    expect(
      within(dialog)
        .getAllByRole('link', { name: /^Выбрать: / })[0]
        .getAttribute('href'),
    ).toMatch(/^\/hotels\/[^/]+\/rooms\?checkin=2026-10-20&checkout=2026-10-23&adults=3&rooms=1#/)
    expect(window.location.search).toBe(search)
    expect(cardNames()).toEqual(before)
  })

  // search-results-page, Requirement: Панель цены в окне отеля
  it('keeps the price bar of the hotel page at the bottom of the scrolling dialog, with its dates and guests', async () => {
    const user = userEvent.setup()
    open(`${PRAGUE}&hotel=${hotel.id}`, { desktop: true })
    await results()
    const dialog = await screen.findByRole('dialog', { name: hotel.name })
    const bar = within(dialog).getByRole('region', { name: 'Цена' })

    expect(bar.className).toContain('sticky')
    expect(bar.className).toContain('bottom-0')
    expect(bar.closest('.overflow-y-auto')).not.toBeNull()
    expect(within(bar).getByText('за 3 ночи, для 2 гостей')).toBeDefined()
    await user.click(within(dialog).getByRole('button', { name: /^Гости: / }))
    await user.click(await screen.findByRole('button', { name: 'Взрослые: увеличить' }))
    expect(within(bar).getByText('за 3 ночи, для 3 гостей')).toBeDefined()
    expect(within(bar).getByRole('button', { name: 'Выбрать номер' })).toBeDefined()
  })

  it('ignores an unknown hotel id', async () => {
    open(`${PRAGUE}&hotel=no-such-hotel`)
    await results()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(cards().length).toBeGreaterThan(0)
  })

  it('opens the hotel page from a marker on narrow screens, with the dates and guests of the search', async () => {
    const user = userEvent.setup()
    open(PRAGUE)
    await results()
    await user.click(screen.getByRole('button', { name: 'Карта' }))
    const [marker] = await markers()
    const hotel = fullHotelsIn('prague').find((h) => marker.getAttribute('aria-label')!.startsWith(`${h.name}, `))!

    await user.click(marker)

    expect(push).toHaveBeenCalledWith(`/hotels/${hotel.id}?${STAY}`)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.search).not.toContain('hotel=')
  })

  it('opens the hotel page instead of the dialog for a link with the hotel on narrow screens', async () => {
    const hotel = fullHotelsIn('prague')[0]
    open(`${PRAGUE}&hotel=${hotel.id}`)
    await results()

    expect(replace).toHaveBeenCalledWith(`/hotels/${hotel.id}?${STAY}`)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

// search-results-page, Requirement: Окно отеля с карты, Scenario: Телефон
describe('SearchResultsPage back from the hotel page', () => {
  const markers = () => screen.findAllByRole('button', { name: /, [\d\s]+₽$/ }, { timeout: 3000 })

  it('returns to the map with the same centre and zoom after "Назад" from the hotel page', async () => {
    const user = userEvent.setup()
    const { unmount } = open(PRAGUE)
    await results()
    await user.click(screen.getByRole('button', { name: 'Карта' }))
    const [marker] = await markers()
    expect(mapMock.fitted).toBe(1)

    // The user zooms in and moves the map.
    mapMock.center = { lng: 14.41, lat: 50.09 }
    mapMock.zoom = 17
    act(() => mapMock.last!.fire('moveend'))
    await user.click(marker)
    expect(push).toHaveBeenCalled()

    // The hotel page replaces the results; "Назад" renders them anew.
    unmount()
    mapMock.options = []
    mapMock.fitted = 0
    open(PRAGUE)
    await results()

    expect(screen.getByRole('button', { name: 'Список' })).toBeDefined()
    await markers()
    expect(mapMock.options).toHaveLength(1)
    expect(mapMock.options[0]).toMatchObject({ center: [14.41, 50.09], zoom: 17 })
    expect(mapMock.fitted).toBe(0)
  })

  it('starts another search on the list, its map framing the hotels', async () => {
    const user = userEvent.setup()
    const { unmount } = open(PRAGUE)
    await results()
    await user.click(screen.getByRole('button', { name: 'Карта' }))
    await markers()
    unmount()

    open(`${PRAGUE}&stars=5`)
    await results()
    expect(screen.getByRole('button', { name: 'Карта' })).toBeDefined()
  })

  it('keeps the map when the filters change on it', async () => {
    const user = userEvent.setup()
    open(PRAGUE)
    await results()
    await user.click(screen.getByRole('button', { name: 'Карта' }))
    await markers()

    await user.click(screen.getByRole('button', { name: 'Фильтры' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Фильтры' })).getByRole('button', { name: '5 звёзд' }))

    expect(window.location.search).toContain('stars=5')
    expect(screen.getByRole('button', { name: 'Список', hidden: true })).toBeDefined()
    expect(mapMock.options).toHaveLength(1)
  })
})

// search-results-page, Requirement: Карта результатов поиска, Scenario: Группа
describe('SearchResultsPage map groups', () => {
  const groups = () => screen.findAllByRole('button', { name: /приблизить$/ }, { timeout: 3000 })

  it('groups close markers into "N от X ₽" with the cheapest price, and zooms in when pressed', async () => {
    const user = userEvent.setup()
    mapMock.zoom = 8
    open(PRAGUE, { desktop: true })
    await results()

    const [group] = await groups()
    const all = applyFilters(fullHotelsIn('prague'), NO_FILTERS, {
      checkIn: '2026-10-20',
      checkOut: '2026-10-23',
      guests: { adults: 2, children: 0, rooms: 1 },
    })
    // At zoom 8 the whole city is one group.
    const cheapest = formatPrice(Math.min(...all.map((i) => i.price)))
    const count = all.length
    expect(group.getAttribute('aria-label')).toBe(
      `${countRu(count, ['отель', 'отеля', 'отелей'])}, от ${cheapest}, приблизить`,
    )
    expect(group.textContent).toBe(`${count} от ${cheapest}`)
    expect(screen.queryAllByRole('button', { name: /, [\d\s]+₽$/ })).toHaveLength(0)

    await user.click(group)
    expect(mapMock.eased).toHaveLength(1)
    expect((mapMock.eased[0] as { zoom: number }).zoom).toBeGreaterThan(8)
  })

  it('highlights the group of a hovered card', async () => {
    const user = userEvent.setup()
    mapMock.zoom = 8
    open(PRAGUE, { desktop: true })
    await results()
    const [group] = await groups()
    expect(group.hasAttribute('data-active')).toBe(false)

    await user.hover(cards()[0])
    expect(group.hasAttribute('data-active')).toBe(true)
  })

  it('regroups the markers once a zoom ends', async () => {
    mapMock.zoom = 8
    open(PRAGUE, { desktop: true })
    await results()
    await groups()

    mapMock.zoom = 18
    act(() => mapMock.last!.fire('zoomend'))
    expect(screen.queryAllByRole('button', { name: /приблизить$/ })).toHaveLength(0)
    expect(screen.getAllByRole('button', { name: /, [\d\s]+₽$/ })).toHaveLength(cards().length)
  })
})

// search-results-page, Requirement: Страницы результатов
describe('SearchResultsPage pages', () => {
  const EUROPE = `scenario=europe&${STAY}`
  const markers = () => screen.findAllByRole('button', { name: /, [\d\s]+₽$/ }, { timeout: 3000 })
  const pagination = () => screen.getByRole('navigation', { name: 'Страницы результатов' })
  const total = () => Number(screen.getByText(/^Найдено \d+/).textContent!.match(/\d+/)![0])

  it('shows 12 hotels per page with the navigation, current page marked', async () => {
    open(EUROPE)
    await results()

    expect(total()).toBeGreaterThan(12)
    expect(cards()).toHaveLength(12)
    expect(within(pagination()).getByRole('link', { name: 'Страница 1' }).getAttribute('aria-current')).toBe('page')
    expect(within(pagination()).queryByRole('link', { name: 'Предыдущая страница' })).toBeNull()
  })

  it('moves to the second page with a new history entry, and "Назад" returns', async () => {
    const user = userEvent.setup()
    open(EUROPE)
    await results()
    const first = cardNames()
    // The length of jsdom's history depends on the entries earlier tests left after the current one.
    const pushState = vi.spyOn(window.history, 'pushState')

    await user.click(within(pagination()).getByRole('link', { name: 'Страница 2' }))

    expect(window.location.search).toContain('page=2')
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(cardNames()).toHaveLength(Math.min(12, total() - 12))
    expect(cardNames().some((name) => first.includes(name))).toBe(false)
    expect(within(pagination()).getByRole('link', { name: 'Страница 2' }).getAttribute('aria-current')).toBe('page')

    act(() => window.history.back())
    await waitFor(() => expect(window.location.search).not.toContain('page='))
    await waitFor(() => expect(cardNames()).toEqual(first))
  })

  it('focuses the results heading after the move', async () => {
    const user = userEvent.setup()
    open(EUROPE)
    await results()

    await user.click(within(pagination()).getByRole('link', { name: 'Следующая страница' }))

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: /^Найдено \d+/ })))
  })

  it('takes the nearest existing page for an invalid one', async () => {
    open(`${EUROPE}&page=99`)
    await results()
    const last = Math.ceil(total() / 12)
    expect(
      within(pagination())
        .getByRole('link', { name: `Страница ${last}` })
        .getAttribute('aria-current'),
    ).toBe('page')

    cleanup()
    open(`${EUROPE}&page=abc`)
    await results()
    expect(within(pagination()).getByRole('link', { name: 'Страница 1' }).getAttribute('aria-current')).toBe('page')
  })

  it('returns to the first page when the sorting changes', async () => {
    const user = userEvent.setup()
    open(`${EUROPE}&page=2`, { desktop: true })
    await results()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Сортировка' }), 'price_asc')

    expect(window.location.search).not.toContain('page=')
    expect(window.location.search).toContain('sort=price_asc')
    expect(within(pagination()).getByRole('link', { name: 'Страница 1' }).getAttribute('aria-current')).toBe('page')
  })

  it('hides the navigation for a single page', async () => {
    open(PRAGUE)
    await results()

    expect(total()).toBeLessThanOrEqual(12)
    expect(screen.queryByRole('navigation', { name: 'Страницы результатов' })).toBeNull()
  })

  it('keeps the page when a hotel dialog opens and closes', async () => {
    const user = userEvent.setup()
    open(`${EUROPE}&page=2`, { desktop: true })
    await results()
    const [marker] = await markers()

    await user.click(marker)
    expect(await screen.findByRole('dialog')).toBeDefined()
    expect(window.location.search).toMatch(/page=2.*hotel=|hotel=.*page=2/)

    act(() => window.history.back())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(window.location.search).toContain('page=2')
  })

  it('shows markers of all hotels on the second page and highlights the marker of a hovered card', async () => {
    const user = userEvent.setup()
    open(`${EUROPE}&page=2`, { desktop: true })
    await results()

    await waitFor(async () => expect(await markers()).toHaveLength(total()))
    expect(cards().length).toBeLessThan(total())
    const card = cards()[0]
    await user.hover(card)
    const name = within(card).getByRole('heading').textContent!
    expect(screen.getByRole('button', { name: new RegExp(`^${name}, `) }).hasAttribute('data-active')).toBe(true)
  })
})
