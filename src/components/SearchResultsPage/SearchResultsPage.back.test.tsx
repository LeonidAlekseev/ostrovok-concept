import { push, replace, mapMock, STAY, PRAGUE, open, results, markers, cards, nameOf } from './searchResultsTestKit'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fullHotelsIn } from '../../lib/catalogGenerator'

// search-results-page, Requirement: Отель открывается своей страницей
describe('SearchResultsPage opens the hotel page', () => {
  const hotel = fullHotelsIn('prague')[0]

  it('opens the page of a pressed marker with the dates of the search, without a dialog (Scenario: Метка на карте)', async () => {
    const user = userEvent.setup()
    open(PRAGUE, { desktop: true })
    await results()
    const [, marker] = await markers()
    const name = marker.getAttribute('aria-label')!.split(',')[0]
    const id = fullHotelsIn('prague').find((h) => h.name === name)!.id

    await user.click(marker)

    expect(push).toHaveBeenCalledWith(`/hotels/${id}?${STAY}`)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.search).not.toContain('hotel=')
  })

  it('leads from a card to the hotel page with the dates of the search (Scenario: Карточка)', async () => {
    open(PRAGUE, { desktop: true })
    await results()
    const link = cards()[0].querySelector('h3 a')!
    expect(link.getAttribute('href')).toMatch(new RegExp(`^/hotels/[^?]+\\?${STAY}$`))
  })

  it('opens the hotel page in place of the results for an older link with the hotel', async () => {
    for (const desktop of [true, false]) {
      replace.mockClear()
      const { unmount } = open(`${PRAGUE}&hotel=${hotel.id}`, { desktop })
      await results()
      await waitFor(() => expect(replace).toHaveBeenCalledWith(`/hotels/${hotel.id}?${STAY}`))
      expect(screen.queryByRole('dialog')).toBeNull()
      unmount()
    }
  })

  it('ignores an unknown hotel id', async () => {
    open(`${PRAGUE}&hotel=no-such-hotel`)
    await results()

    expect(replace).not.toHaveBeenCalled()
    expect(cards().length).toBeGreaterThan(0)
  })
})

// search-results-page, Requirement: Назад к тому же месту поиска
describe('SearchResultsPage back to the same place', () => {
  const scrolled = (y: number) => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
  }
  afterEach(() => scrolled(0))

  it('returns to the scroll of the list and marks the hotel opened from it (Scenario: Из середины списка)', async () => {
    const user = userEvent.setup()
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    const { unmount } = open(`${PRAGUE}&sort=price_asc`, { desktop: true })
    await results()
    const card = cards()[5]
    const name = nameOf(card)
    scrolled(1240)
    // The link is followed by Next; here only the click is seen.
    const link = card.querySelector<HTMLAnchorElement>('h3 a')!
    link.addEventListener('click', (e) => e.preventDefault())
    await user.click(link)
    await user.unhover(card)
    unmount()
    scrolled(0)

    open(`${PRAGUE}&sort=price_asc`, { desktop: true, back: true })
    await results()

    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 1240, behavior: 'instant' }))
    const again = cards().find((c) => nameOf(c) === name)!
    expect(again.hasAttribute('data-active')).toBe(true)
    expect(screen.getByRole('button', { name: new RegExp(`^${name}, `) }).hasAttribute('data-active')).toBe(true)
  }, 20_000)

  it('returns to the camera of the map and marks the hotel of the pressed marker (Scenario: С метки на карте)', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('scrollTo', vi.fn())
    const { unmount } = open(PRAGUE, { desktop: true })
    await results()
    const [, marker] = await markers()
    const name = marker.getAttribute('aria-label')!.split(',')[0]
    mapMock.center = { lng: 14.43, lat: 50.07 }
    mapMock.zoom = 16
    act(() => mapMock.last!.fire('moveend'))
    await user.click(marker)
    unmount()
    mapMock.options = []
    mapMock.fitted = 0

    open(PRAGUE, { desktop: true, back: true })
    await results()

    await markers()
    expect(mapMock.options[0]).toMatchObject({ center: [14.43, 50.07], zoom: 16 })
    expect(mapMock.fitted).toBe(0)
    expect(screen.getByRole('button', { name: new RegExp(`^${name}, `) }).hasAttribute('data-active')).toBe(true)
  })

  it('returns to a later page of the list without moving to its heading', async () => {
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { unmount } = open(`scenario=europe&${STAY}&page=2`, { desktop: true })
    await results()
    scrolled(700)
    act(() => window.dispatchEvent(new Event('scroll')))
    await waitFor(() => expect(window.sessionStorage.getItem('search-views')).toContain('"scrollY":700'))
    unmount()
    scrolled(0)

    open(`scenario=europe&${STAY}&page=2`, { desktop: true, back: true })
    await results()

    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 700, behavior: 'instant' }))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('starts a new entry of the same search at the top, with nothing marked', async () => {
    const user = userEvent.setup()
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    const { unmount } = open(PRAGUE, { desktop: true })
    await results()
    scrolled(900)
    await user.click((await markers())[0])
    unmount()
    scrolled(0)

    open(PRAGUE, { desktop: true })
    await results()

    expect(scrollTo).not.toHaveBeenCalled()
    expect(cards().some((c) => c.hasAttribute('data-active'))).toBe(false)
  })
})

// search-results-page, Requirement: Назад к тому же месту поиска, Scenario: Телефон
describe('SearchResultsPage back from the hotel page', () => {
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
    // A marker opens the hotel page, with the dates and guests of the search.
    const hotel = fullHotelsIn('prague').find((h) => marker.getAttribute('aria-label')!.startsWith(`${h.name}, `))!
    expect(push).toHaveBeenCalledWith(`/hotels/${hotel.id}?${STAY}`)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.search).not.toContain('hotel=')

    // The hotel page replaces the results; "Назад" renders them anew.
    unmount()
    mapMock.options = []
    mapMock.fitted = 0
    open(PRAGUE, { back: true })
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
