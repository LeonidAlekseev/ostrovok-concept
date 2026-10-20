import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fullHotelsIn, MEAL_LABEL } from '../../lib/catalog'
import { applyFilters, NO_FILTERS } from '../../lib/results'
import { SearchResultsPage } from './SearchResultsPage'

// The page reads the URL through Next's hooks; here they read jsdom's location and, like Next,
// follow `pushState`, `replaceState` and "Назад".
const push = vi.fn()
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
    useRouter: () => ({ push, replace: vi.fn() }),
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
    fitBounds() {}
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
const cardNames = () => cards().map((card) => within(card).getByRole('heading').textContent)
// The regular price comes before the GURU one.
const priceOf = (card: HTMLElement) => within(card).getAllByText(/^[\d\s]+₽$/)[0].textContent!
const prices = () => cards().map((card) => Number(priceOf(card).replace(/\D/g, '')))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  mapMock.fail = false
  mapMock.options = []
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  push.mockClear()
})

// search-results-page, Requirement: Страница результатов
describe('SearchResultsPage query', () => {
  it('shows the loading state, then the summary and the hotels of the city', async () => {
    open(PRAGUE)

    expect(screen.getByText('Ищем варианты…').closest('[aria-live="polite"]')).not.toBeNull()
    await results()

    expect(screen.getByRole('heading', { level: 1, name: 'Прага, Чехия' })).toBeDefined()
    expect(screen.getByText(/3 ночи · 2 гостя/)).toBeDefined()
    expect(cards().length).toBeGreaterThanOrEqual(6)
  })

  it('shows the hotels of every destination of a scenario', async () => {
    open(`scenario=sea&${STAY}`)
    await results()

    expect(screen.getByRole('heading', { level: 1, name: 'У моря' })).toBeDefined()
    expect(cards().length).toBeGreaterThan(6)
  })

  it('shows the search form with the destination error for a query without a destination', () => {
    open('')

    expect(screen.getByRole('form', { name: 'Поиск отелей' })).toBeDefined()
    expect(screen.getByText('Укажите, куда вы хотите поехать')).toBeDefined()
    expect(screen.queryByText('Ищем варианты…')).toBeNull()
  })

  it('opens a new search from "Изменить поиск"', async () => {
    const user = userEvent.setup()
    open(PRAGUE)
    await results()

    await user.click(screen.getByRole('button', { name: 'Изменить поиск' }))
    const destination = screen.getByRole('combobox', { name: 'Направление' })
    expect((destination as HTMLInputElement).value).toBe('Прага')
    await user.clear(destination)
    await user.type(destination, 'Париж')
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: /Найти отель/ }))

    expect(push).toHaveBeenCalledWith(`/search?destination=paris&${STAY}`)
  })
})

// search-results-page, Requirement: Карточка отеля в результатах
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

  it('lists the hotels in one column up to 2xl and in two from 2xl', async () => {
    open(PRAGUE)
    await results()

    const list = screen.getByRole('region', { name: 'Отели' }).querySelector('ul')!
    expect(list.className).toMatch(/(^|\s)2xl:grid-cols-2(\s|$)/)
    expect(list.className).not.toMatch(/(^|\s)(sm|md|lg|xl):grid-cols-/)
  })
})

// search-results-page, Requirement: Фильтры и сортировка
describe('SearchResultsPage filters', () => {
  it('filters by stars and sorts by price, writing both into the URL without new history entries', async () => {
    const user = userEvent.setup()
    open(PRAGUE)
    await results()
    const pushState = vi.spyOn(window.history, 'pushState')

    await user.click(screen.getByRole('checkbox', { name: '5 звёзд' }))
    expect(window.location.search).toContain('stars=5')
    expect(cards().length).toBeGreaterThan(0)
    for (const card of cards()) expect(within(card).getByLabelText('5 звёзд')).toBeDefined()

    await user.selectOptions(screen.getByLabelText('Сортировка'), 'Сначала дешевле')
    expect(window.location.search).toContain('sort=price_asc')
    expect(prices()).toEqual([...prices()].sort((a, b) => a - b))
    expect(pushState).not.toHaveBeenCalled()
  })

  it('restores the filters and the sorting from the URL', async () => {
    open(`${PRAGUE}&stars=5,4&rating=8&free_cancel=1&sort=price_desc`)
    await results()

    expect(screen.getByRole('checkbox', { name: '5 звёзд' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('checkbox', { name: '4 звезды' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('checkbox', { name: '3 звезды' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('radio', { name: 'от 8' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('checkbox', { name: 'Бесплатная отмена' }).getAttribute('aria-checked')).toBe('true')
    expect((screen.getByLabelText('Сортировка') as HTMLSelectElement).value).toBe('price_desc')
    expect(prices()).toEqual([...prices()].sort((a, b) => b - a))
    for (const card of cards()) expect(within(card).getByText('Бесплатная отмена')).toBeDefined()
  })

  it('shows "Ничего не нашлось" and resets the filters', async () => {
    const user = userEvent.setup()
    open(PRAGUE)
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
    await user.click(screen.getByRole('checkbox', { name: '5 звёзд' }))
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
    open(`${PRAGUE}&hotel=${hotel.id}`)
    await results()

    const dialog = await screen.findByRole('dialog', { name: hotel.name })
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(window.location.search).toBe(`?${PRAGUE}`)
    expect(cards().length).toBeGreaterThan(0)
  })

  it('starts the dialog with the start dates of a search without dates', async () => {
    open(`destination=prague&hotel=${hotel.id}`)
    await results()

    const dialog = await screen.findByRole('dialog', { name: hotel.name })

    expect(within(dialog).getByRole('link', { name: 'Открыть страницу отеля' }).getAttribute('href')).toBe(
      `/hotels/${hotel.id}?checkin=2026-10-20&checkout=2026-10-21&adults=2&rooms=1`,
    )
    expect(within(dialog).queryByText('Выберите даты')).toBeNull()
  })

  it('changes the stay in the dialog only: the address and the list stay and the links follow', async () => {
    const user = userEvent.setup()
    open(`${PRAGUE}&hotel=${hotel.id}`)
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
    open(`${PRAGUE}&hotel=${hotel.id}`)
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

  it('opens the dialog from a marker on narrow screens and stays on the map', async () => {
    const user = userEvent.setup()
    open(PRAGUE)
    await results()
    await user.click(screen.getByRole('button', { name: 'Карта' }))
    const [marker] = await markers()

    await user.click(marker)

    expect(await screen.findByRole('dialog')).toBeDefined()
    // The page behind the modal dialog is hidden from assistive technology.
    expect(screen.getByRole('button', { name: 'Карта', hidden: true }).getAttribute('aria-pressed')).toBe('true')
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
    const length = window.history.length

    await user.click(within(pagination()).getByRole('link', { name: 'Страница 2' }))

    expect(window.location.search).toContain('page=2')
    expect(window.history.length).toBe(length + 1)
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
    open(`${EUROPE}&page=2`)
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
