import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchResultsPage } from './SearchResultsPage'

// The page reads the URL through Next's hooks; here they read jsdom's location.
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push }),
}))

// jsdom has no WebGL: a stand-in map that loads (or fails) on the next tick and places markers in its container.
const mapMock = vi.hoisted(() => ({ fail: false }))
vi.mock('maplibre-gl', () => {
  type Handler = () => void
  class Map {
    container: HTMLElement
    handlers: Record<string, Handler[]> = {}
    constructor({ container }: { container: HTMLElement }) {
      this.container = container
      setTimeout(() => this.handlers[mapMock.fail ? 'error' : 'load']?.forEach((h) => h()))
    }
    on(type: string, handler: Handler) {
      ;(this.handlers[type] ??= []).push(handler)
      return this
    }
    fitBounds() {}
    resize() {}
    remove() {}
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
  return { Map, Marker, LngLatBounds, setWorkerUrl: () => {} }
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
const prices = () => cards().map((card) => Number(within(card).getByText(/^от /).textContent!.replace(/\D/g, '')))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  Element.prototype.scrollIntoView = vi.fn()
  mapMock.fail = false
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
    expect(within(card).getByText('за 3 ночи, 2 номера')).toBeDefined()
    expect(within(card).getByText(/км до центра/)).toBeDefined()
    expect(within(card).getByText(/\d+ отзыв/)).toBeDefined()
    expect(within(card).getByRole('button', { name: 'Добавить в избранное' })).toBeDefined()
  })

  it('puts the photo above the text in every card', async () => {
    open(PRAGUE)
    await results()

    for (const card of cards()) {
      // The first block of the card holds the photo and nothing of the text.
      const top = card.firstElementChild as HTMLElement
      expect(within(top).getAllByRole('img')[0].className).toMatch(/\bw-full\b/)
      expect(within(top).queryByRole('heading')).toBeNull()
    }
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

// search-results-page, Requirement: Карта результатов
describe('SearchResultsPage map', () => {
  const markers = () => screen.findAllByRole('button', { name: /за ночь$/ }, { timeout: 3000 })

  it('shows a price marker per hotel next to the list on wide screens', async () => {
    open(PRAGUE, { desktop: true })
    await results()

    expect(await markers()).toHaveLength(cards().length)
  })

  it('highlights and scrolls to the card of a clicked marker', async () => {
    const user = userEvent.setup()
    open(PRAGUE, { desktop: true })
    await results()
    const [, marker] = await markers()
    const name = marker.getAttribute('aria-label')!.split(',')[0]

    await user.click(marker)

    const card = screen.getByRole('heading', { name }).closest('article')!
    expect(card.hasAttribute('data-active')).toBe(true)
    expect(marker.getAttribute('aria-pressed')).toBe('true')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('highlights the marker of a hovered card', async () => {
    const user = userEvent.setup()
    open(PRAGUE, { desktop: true })
    await results()
    await markers()

    const card = cards()[0]
    await user.hover(card)
    const name = within(card).getByRole('heading').textContent!
    const marker = screen.getByRole('button', { name: new RegExp(`^${name}, .* за ночь$`) })
    expect(marker.getAttribute('aria-pressed')).toBe('true')
  })

  it('switches between the list and the map on narrow screens', async () => {
    const user = userEvent.setup()
    open(PRAGUE)
    await results()
    expect(screen.queryByRole('region', { name: 'Карта отелей' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Карта' }))
    expect(await markers()).toHaveLength(cards().length)
    expect(screen.getByRole('region', { name: 'Отели' }).className).toContain('max-lg:hidden')

    // A marker brings the list back with its card highlighted.
    await user.click((await markers())[0])
    expect(screen.getByRole('region', { name: 'Отели' }).className).not.toContain('max-lg:hidden')
    expect(screen.getByRole('button', { name: 'Список' }).getAttribute('aria-pressed')).toBe('true')
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
