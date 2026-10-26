import {
  fetched,
  push,
  STAY,
  PRAGUE,
  open,
  results,
  cards,
  nameOf,
  slider,
  cardNames,
  prices,
} from './searchResultsTestKit'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MEAL_LABEL } from '../../lib/catalog'
import { destinations } from '../../data/destinations'
import { fullHotelsIn } from '../../lib/catalogGenerator'
import { countRu, formatPrice } from '../../lib/format'
import { applyFilters, NO_FILTERS, priceBounds } from '../../lib/results'

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
  it('shows the manual form over the results, filled from the address; errors stay at the form, a new city changes the address', async () => {
    const user = userEvent.setup()
    open(PRAGUE)
    await results()

    const form = screen.getByRole('form', { name: 'Поиск отелей' })
    expect(form.compareDocumentPosition(cards()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const destination = within(form).getByRole('combobox', { name: 'Направление' })
    expect((destination as HTMLInputElement).value).toBe('Прага')
    await user.clear(destination)
    await user.click(within(form).getByRole('button', { name: /Найти отель/ }))
    expect(screen.getByText('Укажите, куда вы хотите поехать')).toBeDefined()
    expect(push).not.toHaveBeenCalled()

    await user.type(destination, 'Рим')
    await user.keyboard('{Escape}')
    await user.click(within(form).getByRole('button', { name: /Найти отель/ }))

    expect(push).toHaveBeenCalledWith(`/search?destination=rome&${STAY}`)
  })
})

// search-results-page, Requirement: Подборка отелей
describe('SearchResultsPage selection', () => {
  const picked = [...fullHotelsIn('prague').slice(0, 4), ...fullHotelsIn('rome').slice(0, 4)]
  const ids = picked.map((h) => h.id).join(',')
  const names = (hotels: { name: string }[]) => hotels.map((h) => h.name).sort()

  // Scenario: Подборка вайба
  it('shows only the hotels of the selection under the title of its source', async () => {
    open(`hotels=${ids},no-such-hotel&from=vibe&pick=quiet-harbour&${STAY}`)
    await results()

    expect(screen.getByRole('heading', { level: 1, name: 'Подборка по вашему вайбу: Тихая гавань' })).toBeDefined()
    expect(screen.getByRole('heading', { name: `Найдено ${countRu(8, ['вариант', 'варианта', 'вариантов'])}` }))
    expect(cardNames().sort()).toEqual(names(picked))
    // «Изменить поиск» is the manual search: no destination yet, the dates of the selection.
    const form = screen.getByRole('form', { name: 'Поиск отелей' })
    expect((within(form).getByRole('combobox', { name: 'Направление' }) as HTMLInputElement).value).toBe('')
    expect(within(cards()[0]).getByRole('link').getAttribute('href')).toMatch(
      /\?checkin=2026-10-20&checkout=2026-10-23&/,
    )
  })

  it('titles the selections of the stars and the drawing, and of an unknown pick «Подобранные отели»', async () => {
    open(`hotels=${ids}&from=stars&pick=leo&${STAY}`)
    expect(screen.getByRole('heading', { level: 1, name: 'Подборка звёзд для Льва' })).toBeDefined()
    cleanup()
    open(`hotels=${ids}&from=draw&pick=city-heart&${STAY}`)
    expect(screen.getByRole('heading', { level: 1, name: 'Подборка по вашему рисунку: Сердце города' })).toBeDefined()
    // Scenario: Неизвестный источник
    cleanup()
    open(`hotels=${ids}&from=vibe&pick=unknown&${STAY}`)
    expect(screen.getByRole('heading', { level: 1, name: 'Подобранные отели' })).toBeDefined()
  })

  it('starts a selection without dates from tomorrow', async () => {
    open(`hotels=${ids}&from=draw&pick=minimalist`)
    await results()
    expect(within(cards()[0]).getByRole('link').getAttribute('href')).toMatch(
      /\?checkin=2026-10-20&checkout=2026-10-21&/,
    )
  })

  // Scenario: Фильтр в подборке
  it('filters and sorts only the hotels of the selection', async () => {
    const user = userEvent.setup()
    open(`hotels=${ids}&from=vibe&pick=quiet-harbour&${STAY}`, { desktop: true })
    await results()

    await user.click(screen.getByRole('button', { name: 'Бесплатная отмена' }))
    expect(window.location.search).toContain('free_cancel=1')
    expect(new URLSearchParams(window.location.search).get('hotels')).toBe(ids)
    const stay = { checkIn: '2026-10-20', checkOut: '2026-10-23', guests: { adults: 2, children: 0, rooms: 1 } }
    const expected = applyFilters(picked, { ...NO_FILTERS, freeCancel: true }, stay).map((item) => item.hotel)
    // The filter drops some of the selection and adds none of the city.
    expect(expected.length).toBeGreaterThan(0)
    expect(expected.length).toBeLessThan(picked.length)
    expect(cardNames().sort()).toEqual(names(expected))
    for (const card of cards()) expect(within(card).getByText('Бесплатная отмена')).toBeDefined()

    await user.selectOptions(screen.getByLabelText('Сортировка'), 'Сначала дешевле')
    expect(prices()).toEqual([...prices()].sort((a, b) => a - b))
    expect(cardNames().sort()).toEqual(names(expected))
  })

  it('pages the selection by 12', async () => {
    const many = [...fullHotelsIn('prague'), ...fullHotelsIn('rome'), ...fullHotelsIn('paris')].slice(0, 14)
    open(`hotels=${many.map((h) => h.id).join(',')}&from=stars&pick=leo&${STAY}`)
    await results()
    expect(cards()).toHaveLength(12)
    expect(screen.getByRole('navigation', { name: /Страниц/ })).toBeDefined()
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

  it('draws every card as the design wants it: no meal, no reviews, the free cancellation of its rate, the photo on top', async () => {
    open(PRAGUE)
    await results()

    const items = applyFilters(fullHotelsIn('prague'), NO_FILTERS)
    const badges = cards().map((card) => {
      expect(card.textContent).not.toMatch(new RegExp(Object.values(MEAL_LABEL).join('|')))
      expect(card.textContent).not.toMatch(/отзыв/)
      const name = nameOf(card)
      const { rate } = items.find((item) => item.hotel.name === name)!
      const badge = within(card).queryByText('Бесплатная отмена') !== null
      expect(badge, name).toBe(rate.cancellation.kind === 'free')
      // The first block of the card holds the photo and nothing of the text.
      const top = card.firstElementChild as HTMLElement
      expect(within(top).getByRole('group', { name: 'Фото отеля' })).toBeDefined()
      expect(top.className).toMatch(/\bw-full\b/)
      expect(within(top).queryByRole('heading')).toBeNull()
      return badge
    })
    // Every Prague hotel has a free cancellation rate, yet not every cheapest rate is one.
    expect(new Set(badges)).toEqual(new Set([true, false]))
    // One page holds Prague: no navigation.
    expect(Number(screen.getByText(/^Найдено \d+/).textContent!.match(/\d+/)![0])).toBeLessThanOrEqual(12)
    expect(screen.queryByRole('navigation', { name: 'Страницы результатов' })).toBeNull()

    // One column up to 3xl (1920 px), two from 3xl; the page widens and the list gets more room than the map.
    const list = screen.getByRole('region', { name: 'Отели' }).querySelector('ul')!
    expect(list.className).toMatch(/(^|\s)3xl:grid-cols-2(\s|$)/)
    expect(list.className).not.toMatch(/(^|\s)(sm|md|lg|xl|2xl):grid-cols-/)
    const page = screen.getByRole('region', { name: 'Отели' }).closest('main')!
    expect(page.className).toMatch(/(^|\s)3xl:max-w-\(--page-max-wide\)(\s|$)/)
    const columns = screen.getByRole('region', { name: 'Отели' }).closest('.grid')!
    expect(columns.className).toMatch(/(^|\s)3xl:grid-cols-\[15rem_minmax\(0,1\.6fr\)_minmax\(0,1fr\)\](\s|$)/)
    // Three columns from 1440 px, not from the global xl (1240 px): the filters, the list and the map each get a place.
    expect(columns.className).toMatch(
      /(^|\s)min-\[1440px\]:grid-cols-\[15rem_minmax\(0,1fr\)_minmax\(0,1\.25fr\)\](\s|$)/,
    )
    expect(columns.className).not.toMatch(/(^|\s)xl:grid-cols-/)
    expect(screen.getByRole('region', { name: 'Отели' }).className).toMatch(/(^|\s)min-\[1440px\]:col-start-2(\s|$)/)
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
    for (const card of cards()) expect(within(card).getByText(/^(Хостел|Апартаменты)$/)).toBeDefined()
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

  it('shows the stars, the meals and the free cancellation as chips; bounds the price slider by the results, its fields follow', async () => {
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
