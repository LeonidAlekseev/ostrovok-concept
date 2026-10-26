import {
  mapMock,
  NOW,
  PRAGUE,
  open,
  results,
  markerButtons,
  markers,
  cards,
  nameOf,
  priceOf,
} from './searchResultsTestKit'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fullHotelsIn } from '../../lib/catalogGenerator'
import { countRu, formatPrice } from '../../lib/format'
import { applyFilters, NO_FILTERS } from '../../lib/results'

// search-results-page, Requirement: Карта результатов поиска
describe('SearchResultsPage map', () => {
  const markerOf = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}, `) })

  it('shows a marker per hotel with the price of its card, without "за ночь", and highlights the marker of a hovered card', async () => {
    open(`destination=prague&checkin=2026-10-20&checkout=2026-10-23&adults=3&rooms=2`, { desktop: true })
    await results()

    expect(await markers()).toHaveLength(cards().length)
    for (const card of cards()) {
      const name = nameOf(card)
      const price = priceOf(card)
      const marker = markerOf(name)
      expect(marker.textContent).toBe(price)
      expect(marker.getAttribute('aria-label')).toBe(`${name}, ${price}`)
    }
    // The price filter keeps "Цена за ночь"; the cards and the map show no period.
    for (const name of ['Отели', 'Карта отелей'])
      expect(within(screen.getByRole('region', { name })).queryByText(/за \d* ?ноч/)).toBeNull()

    // A hovered card highlights its marker.
    const card = cards()[0]
    await userEvent.setup().hover(card)
    expect(markerOf(nameOf(card)).hasAttribute('data-active')).toBe(true)
  })

  it('shows "Карта недоступна" when the map fails, and the list keeps working', async () => {
    const user = userEvent.setup()
    mapMock.fail = true
    open(PRAGUE, { desktop: true })
    await results()

    expect(await screen.findByText('Карта недоступна', {}, { timeout: 10_000 })).toBeDefined()
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
    await markers()

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
    const [marker] = await markers()
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
  it('shows the short card of a hovered or keyboard-focused marker, highlights its card in the list, hides it on Esc', async () => {
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

    // A keyboard-focused marker shows it too and hides it on Esc.
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

  it('shows no kind of stay on the short card of apartments', async () => {
    const user = userEvent.setup()
    open(PRAGUE, { desktop: true })
    await results()
    const apartments = fullHotelsIn('prague')
      .filter((h) => h.stayType === 'apartments')
      .map((h) => h.name)
    const marker = (await markers()).find((m) => apartments.includes(m.getAttribute('aria-label')!.split(',')[0]))!
    expect(marker).toBeDefined()

    await user.hover(marker)
    const preview = document.getElementById(marker.getAttribute('aria-describedby')!)!
    expect(within(preview).getByText(marker.getAttribute('aria-label')!.split(',')[0])).toBeDefined()
    expect(within(preview).queryByText('Апартаменты')).toBeNull()
    expect(within(preview).queryByRole('img', { name: /звезд|звёзд/ })).toBeNull()
  })
})

// search-results-page, Requirement: Карта результатов поиска, Scenario: Группа
describe('SearchResultsPage map groups', () => {
  const groups = () => screen.findAllByRole('button', { name: /приблизить$/ }, { timeout: 10_000 })

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
      `${countRu(count, ['вариант', 'варианта', 'вариантов'])}, от ${cheapest}, приблизить`,
    )
    expect(group.textContent).toBe(`${count} от ${cheapest}`)
    expect(markerButtons()).toHaveLength(0)

    await user.click(group)
    expect(mapMock.eased).toHaveLength(1)
    expect((mapMock.eased[0] as { zoom: number }).zoom).toBeGreaterThan(8)
  })

  it('highlights the group of a hovered card, and regroups the markers once a zoom ends', async () => {
    const user = userEvent.setup()
    mapMock.zoom = 8
    open(PRAGUE, { desktop: true })
    await results()
    const [group] = await groups()
    expect(group.hasAttribute('data-active')).toBe(false)

    await user.hover(cards()[0])
    expect(group.hasAttribute('data-active')).toBe(true)

    mapMock.zoom = 18
    act(() => mapMock.last!.fire('zoomend'))
    expect(screen.queryAllByRole('button', { name: /приблизить$/ })).toHaveLength(0)
    expect(markerButtons()).toHaveLength(cards().length)
  })
})
