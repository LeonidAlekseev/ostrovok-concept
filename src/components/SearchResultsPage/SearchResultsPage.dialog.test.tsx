import { push, replace, mapMock, STAY, PRAGUE, open, results, markers, cards, cardNames } from './searchResultsTestKit'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fullHotelsIn } from '../../lib/catalogGenerator'

// search-results-page, Requirement: Окно отеля с карты
describe('SearchResultsPage hotel dialog', () => {
  const hotel = fullHotelsIn('prague')[0]

  it('opens the hotel of a pressed marker in a dialog with the dates of the search, without scrolling the list; "Назад" closes it', async () => {
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

    // "Назад" closes it and keeps the results.
    const before = cardNames()
    act(() => window.history.back())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(window.location.search).not.toContain('hotel=')
    expect(cardNames()).toEqual(before)
  })

  it('closes the dialog of a marker with "Закрыть"', async () => {
    const user = userEvent.setup()
    open(PRAGUE, { desktop: true })
    await results()
    await user.click((await markers())[0])

    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Закрыть' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(window.location.search).not.toContain('hotel='))
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

  // search-results-page, Requirement: Панель цены в окне отеля
  it('opens the dialog right away from a link; the stay changes in it only, the booking card ends it unstuck; closes in place', async () => {
    const user = userEvent.setup()
    open(`${PRAGUE}&hotel=${hotel.id}`, { desktop: true })
    await results()
    const before = cardNames()
    const search = window.location.search
    const dialog = await screen.findByRole('dialog', { name: hotel.name })
    const bar = within(dialog).getByRole('region', { name: 'Цена' })

    expect(bar.className).not.toContain('sticky')
    expect(bar.closest('.overflow-y-auto')).not.toBeNull()
    expect(within(dialog).queryByRole('button', { name: /^Выбрать даты$|^Забронировать ·/ })).toBeNull()
    expect(within(bar).getByText('за 3 ночи для 2 гостей')).toBeDefined()
    await user.click(within(bar).getByRole('button', { name: /^Гости: / }))
    await user.click(await screen.findByRole('button', { name: 'Взрослые: увеличить' }))

    expect(within(bar).getByText('за 3 ночи для 3 гостей')).toBeDefined()
    expect(within(bar).getByRole('button', { name: 'Забронировать' })).toBeDefined()
    const changed = `/hotels/${hotel.id}?checkin=2026-10-20&checkout=2026-10-23&adults=3&rooms=1`
    expect(within(dialog).getByRole('link', { name: 'Открыть страницу отеля' }).getAttribute('href')).toBe(changed)
    expect(
      within(dialog)
        .getAllByRole('link', { name: /^Выбрать: / })[0]
        .getAttribute('href'),
    ).toMatch(/^\/hotels\/[^/]+\/rooms\?checkin=2026-10-20&checkout=2026-10-23&adults=3&rooms=1#/)
    expect(window.location.search).toBe(search)
    expect(cardNames()).toEqual(before)

    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(window.location.search).toBe(`?${PRAGUE}`)
    expect(cards().length).toBeGreaterThan(0)
  })

  it('ignores an unknown hotel id', async () => {
    open(`${PRAGUE}&hotel=no-such-hotel`)
    await results()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(cards().length).toBeGreaterThan(0)
  })

  it('opens the hotel page instead of the dialog for a link with the hotel on narrow screens', async () => {
    const hotel = fullHotelsIn('prague')[0]
    open(`${PRAGUE}&hotel=${hotel.id}`)
    await results()

    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/hotels/${hotel.id}?${STAY}`))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

// search-results-page, Requirement: Окно отеля с карты, Scenario: Телефон
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
    // A marker opens the hotel page, with the dates and guests of the search, not the dialog.
    const hotel = fullHotelsIn('prague').find((h) => marker.getAttribute('aria-label')!.startsWith(`${h.name}, `))!
    expect(push).toHaveBeenCalledWith(`/hotels/${hotel.id}?${STAY}`)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.search).not.toContain('hotel=')

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
