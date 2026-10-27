import { push, STAY, PRAGUE, open, results, markers, cards, nameOf, cardNames, prices } from './searchResultsTestKit'
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// search-results-page, Requirement: Строка поиска; Фильтры на телефоне
describe('SearchResultsPage compact bar', () => {
  const sheet = () => screen.getByRole('dialog', { name: 'Фильтры' })

  it('shows the filters and map buttons on narrow screens only, hidden from lg; the map button toggles with the list', async () => {
    const user = userEvent.setup()
    open(PRAGUE)
    await results()

    for (const name of ['Фильтры', 'Карта']) {
      const button = screen.getByRole('button', { name })
      expect(button.className).toMatch(/(^|\s)lg:hidden(\s|$)/)
    }
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('sr-only')
    expect(screen.queryByRole('region', { name: 'Карта отелей' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Карта' }))
    expect(await markers()).toHaveLength(cards().length)
    expect(screen.getByRole('region', { name: 'Отели' }).className).toContain('max-lg:hidden')
    expect(screen.queryByRole('button', { name: 'Карта' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Список' }))
    expect(screen.getByRole('button', { name: 'Карта' })).toBeDefined()
    expect(screen.getByRole('region', { name: 'Отели' }).className).not.toContain('hidden')
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

  it('names the filters button with the number of enabled filters: stars, free cancellation, rating range, amenities', async () => {
    open(`${PRAGUE}&stars=5,4&free_cancel=1&rating_min=7&amenities=wifi,parking`)
    await results()

    const button = screen.getByRole('button', { name: 'Фильтры, включено 4' })
    expect(button.textContent).toBe('4')
  })

  it('applies filters at once in the bottom sheet, sorting first, closes with "Показать N вариантов", and sorts from it', async () => {
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
    const show = within(dialog).getByRole('button', { name: /^Показать \d+ вариант/ })
    expect(show.textContent).toBe(`Показать ${total} ${total === 1 ? 'вариант' : total < 5 ? 'варианта' : 'вариантов'}`)

    await user.click(show)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Фильтры, включено 1' })).toBeDefined()
    for (const card of cards()) expect(within(card).getByLabelText('5 звёзд')).toBeDefined()

    // The sorting works from the sheet as well.
    await user.click(screen.getByRole('button', { name: 'Фильтры, включено 1' }))
    await user.selectOptions(within(sheet()).getByLabelText('Сортировка'), 'price_asc')
    expect(window.location.search).toContain('sort=price_asc')
    expect(prices()).toEqual([...prices()].sort((a, b) => a - b))
  })
})

// search-results-page, Requirement: Страницы результатов
describe('SearchResultsPage pages', () => {
  const EUROPE = `scenario=europe&${STAY}`
  const pagination = () => screen.getByRole('navigation', { name: 'Страницы результатов' })
  const total = () => Number(screen.getByText(/^Найдено \d+/).textContent!.match(/\d+/)![0])

  it('shows 12 hotels per page; moves to the second page with a new history entry, "Назад" returns, the heading is focused', async () => {
    const user = userEvent.setup()
    open(EUROPE)
    await results()

    expect(total()).toBeGreaterThan(12)
    expect(cards()).toHaveLength(12)
    expect(within(pagination()).getByRole('link', { name: 'Страница 1' }).getAttribute('aria-current')).toBe('page')
    expect(within(pagination()).queryByRole('link', { name: 'Предыдущая страница' })).toBeNull()
    const first = cardNames()
    // The length of jsdom's history depends on the entries earlier tests left after the current one.
    const pushState = vi.spyOn(window.history, 'pushState')

    await user.click(within(pagination()).getByRole('link', { name: 'Страница 2' }))

    expect(window.location.search).toContain('page=2')
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(cardNames()).toHaveLength(Math.min(12, total() - 12))
    expect(cardNames().some((name) => first.includes(name))).toBe(false)
    expect(within(pagination()).getByRole('link', { name: 'Страница 2' }).getAttribute('aria-current')).toBe('page')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: /^Найдено \d+/ })))

    act(() => window.history.back())
    await waitFor(() => expect(window.location.search).not.toContain('page='))
    await waitFor(() => expect(cardNames()).toEqual(first))
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

  it('marks all hotels on the second page and highlights the marker of a hovered card', async () => {
    const user = userEvent.setup()
    open(`${EUROPE}&page=2`, { desktop: true })
    await results()

    await waitFor(async () => expect(await markers()).toHaveLength(total()))
    expect(cards().length).toBeLessThan(total())
    const card = cards()[0]
    await user.hover(card)
    const name = nameOf(card)
    expect(screen.getByRole('button', { name: new RegExp(`^${name}, `) }).hasAttribute('data-active')).toBe(true)
  })

  it('keeps the page in the address when a marker opens the hotel page', async () => {
    const user = userEvent.setup()
    open(`${EUROPE}&page=2`, { desktop: true })
    await results()

    await user.click((await markers())[0])
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/hotels\//))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.search).toContain('page=2')
  })
})
