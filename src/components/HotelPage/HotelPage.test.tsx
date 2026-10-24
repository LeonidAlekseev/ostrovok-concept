import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AMENITIES, cheapestRate, POPULAR_AMENITIES, workLabels } from '@/lib/catalog'
import { fullHotelsIn, getHotel } from '@/lib/catalogGenerator'
import { formatPrice } from '@/lib/format'
import { guruPrice, stayTotal } from '@/lib/offer'
import type { Stay } from '@/lib/search'
import { scoreColor } from '@/lib/reviews'
import { AboutHotel } from './AboutHotel'
import { HotelPage } from './HotelPage'
import { HotelRating } from './HotelRating'

const nav = vi.hoisted(() => ({ query: '', replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  usePathname: () => '/hotels/x',
  useRouter: () => ({ replace: nav.replace }),
}))

const hotel = getHotel('prague-old-town-lantern')!
const cheapest = cheapestRate(hotel).rate.pricePerNight
const guests = { adults: 2, children: 0, rooms: 1 }

beforeEach(() => {
  // Tuesday, 20 October 2026.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 20, 12))
  nav.query = ''
})
afterEach(() => vi.useRealTimers())

/** The hotel inside the dialog of the results map: the stay is held by the caller. */
const renderLocal = (stay: Stay, onChange = vi.fn()) =>
  render(<HotelPage hotel={hotel} titleId="t" stay={{ value: stay, onChange }} />)

// hotel-page, Requirement: Блок оценки
describe('HotelRating', () => {
  const rated = { ...hotel, rating: 9.1, reviewCount: 1323 }

  it('shows the badge, its word, the counts, 8 section scores and "Читать отзывы (N)"', () => {
    render(<HotelRating hotel={rated} />)
    const block = screen.getByRole('region', { name: 'Оценка гостей' })
    // The badge comes first; a section may score the same.
    expect(within(block).getAllByText('9,1')[0].className).toMatch(/\bbg-\(--score\)/)
    for (const text of ['Превосходно', 'Основано на 1 323 отзывах гостей.'])
      expect(within(block).getByText(text)).toBeDefined()
    // Every review is in Russian: the same count as "Основано на…".
    expect(within(block).getByText('На вашем языке доступно 1 323 отзыва.')).toBeDefined()
    const sections = within(block).getByRole('list', { name: 'Оценки по разделам' })
    expect(within(sections).getAllByRole('listitem')).toHaveLength(8)
    expect(within(block).getByRole('button', { name: /^Читать отзывы \(1\s323\)$/ })).toBeDefined()
    expect(within(block).queryByRole('list', { name: 'Распределение оценок' })).toBeNull()
  })

  it('words the counts by number: 21 and 1 review, 846 reviews', () => {
    const { unmount } = render(<HotelRating hotel={{ ...hotel, reviewCount: 21 }} />)
    expect(screen.getByText('Основано на 21 отзыве гостей.')).toBeDefined()
    expect(screen.getByText('На вашем языке доступен 21 отзыв.')).toBeDefined()
    unmount()
    render(<HotelRating hotel={{ ...hotel, reviewCount: 846 }} />)
    expect(screen.getByText('Основано на 846 отзывах гостей.')).toBeDefined()
    expect(screen.getByText('На вашем языке доступно 846 отзывов.')).toBeDefined()
  })

  it('wraps the own-language count without a lone last word', () => {
    render(<HotelRating hotel={{ ...hotel, reviewCount: 846 }} />)
    expect(screen.getByText('На вашем языке доступно 846 отзывов.').className).toMatch(/\btext-pretty\b/)
  })

  it('colours the badge and the bars on one scale: Wi‑Fi at 6,1 yellow-orange, cleanliness at 9,2 green', () => {
    const sectionScores = hotel.sectionScores.map((s) => ({
      ...s,
      score: s.label === 'Качество Wi‑Fi' ? 6.1 : s.label === 'Чистота' ? 9.2 : s.score,
    }))
    render(<HotelRating hotel={{ ...rated, sectionScores }} />)
    const bar = (label: string) =>
      screen
        .getByText(label)
        .closest('li')!
        .querySelector<HTMLElement>('[data-score-bar]')!
        .style.getPropertyValue('--score')
    expect(bar('Качество Wi‑Fi')).toBe(scoreColor(6.1))
    expect(bar('Качество Wi‑Fi')).toContain('var(--score-low), var(--score-mid)')
    expect(bar('Чистота')).toBe('var(--score-high)')
    const badge = screen.getAllByText('9,1')[0]
    expect(badge.style.getPropertyValue('--score')).toBe(scoreColor(9.1))
    expect(badge.className).toMatch(/\bbg-\(--score\)/)
  })
})

// hotel-page, Requirement: Расположение отеля
describe('travel distances', () => {
  const tile = (label: string) => screen.getByText(label).closest('li')!.textContent

  it('in a city with a metro shows the centre and the metro in kilometres, no transport tile', () => {
    render(<AboutHotel hotel={{ ...hotel, distanceKm: 1.7, metro: { station: 'Můstek', meters: 1200 } }} />)
    expect(tile('До центра')).toBe('До центрагорода1,7 км')
    expect(tile('До метро')).toBe('До метроMůstek1,2 км')
    expect(screen.queryByText('До транспорта')).toBeNull()
    expect(screen.getByLabelText('Расстояния')).toBeDefined()
    expect(screen.queryByText(/мин/)).toBeNull()
  })

  it('in a city without a metro has only the centre tile', () => {
    render(<AboutHotel hotel={fullHotelsIn('zakynthos')[0]} />)
    expect(screen.getByText('До центра')).toBeDefined()
    expect(screen.queryByText('До метро')).toBeNull()
  })

  it('shows 0,1 km from next door, and has no "км до центра" tile', () => {
    render(<AboutHotel hotel={{ ...hotel, distanceKm: 0.1 }} />)
    expect(tile('До центра')).toContain('0,1 км')
    expect(screen.queryByText(/км до центра/)).toBeNull()
  })
})

// hotel-page, Requirement: Об отеле
describe('AboutHotel', () => {
  it('shows the first 6 popular amenities of the hotel, in their order', () => {
    render(<AboutHotel hotel={hotel} />)
    const work = workLabels(hotel)
    const expected = [
      ...work,
      ...POPULAR_AMENITIES.filter((key) => key !== 'wifi' && hotel.amenities.includes(key))
        .slice(0, 6 - work.length)
        .map((key) => AMENITIES[key].label),
    ]
    const list = screen.getByRole('list', { name: 'Удобства' })
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(expected)
    expect(list.className).toMatch(/\bgrid-cols-2\b/)
    expect(list.className).toMatch(/\blg:grid-cols-3\b/)
  })

  it('"Все удобства" lists every amenity by section, the paid ones marked, and Escape returns focus', async () => {
    const user = userEvent.setup()
    const order = Object.keys(AMENITIES)
    const amenities = [...new Set([...hotel.amenities, 'shuttle', 'spa'] as const)].sort(
      (a, b) => order.indexOf(a) - order.indexOf(b),
    )
    const paidHotel = { ...hotel, amenities }
    render(<AboutHotel hotel={paidHotel} />)
    const button = screen.getByRole('button', { name: 'Все удобства' })
    await user.click(button)
    const dialog = screen.getByRole('dialog', { name: 'Удобства' })
    const items = within(dialog)
      .getAllByRole('listitem')
      .map((li) => li.textContent!.replace('оплачивается отдельно', ''))
    expect(items).toEqual([...workLabels(paidHotel), ...paidHotel.amenities.map((key) => AMENITIES[key].label)])
    const transfer = within(dialog).getByRole('region', { name: 'Трансфер' })
    expect(within(transfer).getByText('Трансфер из аэропорта').textContent).toContain('оплачивается отдельно')
    const internet = within(dialog).getByRole('region', { name: 'Интернет' })
    expect(internet.textContent).not.toContain('оплачивается отдельно')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(button)
  })
})

// hotel-page, Requirement: Блок дат проживания
describe('StayDates', () => {
  it('shows check-in and check-out with the hotel times and the guests with the nights', () => {
    renderLocal({ checkIn: '2026-10-24', checkOut: '2026-10-25', guests })
    const block = screen.getByRole('region', { name: 'Даты проживания' })
    for (const text of ['24 окт, сб', 'с 14:00', '25 окт, вс', 'до 12:00'])
      expect(within(block).getByText(text)).toBeDefined()
    expect(within(block).getByRole('button', { name: /^Гости: / }).textContent).toBe('2 гостя · 1 ночь')
  })

  it('changes the dates with "Изменить" and the guests with their row', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderLocal({ checkIn: '2026-10-24', checkOut: '2026-10-25', guests }, onChange)
    const block = screen.getByRole('region', { name: 'Даты проживания' })

    await user.click(within(block).getByRole('button', { name: 'Изменить' }))
    await user.click(await screen.findByRole('button', { name: / 28 октября 2026/ }))
    await user.click(screen.getByRole('button', { name: / 30 октября 2026/ }))
    expect(onChange).toHaveBeenLastCalledWith({ checkIn: '2026-10-28', checkOut: '2026-10-30', guests })

    await user.click(within(block).getByRole('button', { name: /^Гости: / }))
    await user.click(await screen.findByRole('button', { name: 'Взрослые: увеличить' }))
    expect(onChange).toHaveBeenLastCalledWith({
      checkIn: '2026-10-24',
      checkOut: '2026-10-25',
      guests: { ...guests, adults: 3 },
    })
  })

  it('without dates shows "Выберите даты"', () => {
    render(<HotelPage hotel={hotel} />)
    const block = screen.getByRole('region', { name: 'Даты проживания' })
    expect(within(block).getByText('Выберите даты')).toBeDefined()
    expect(within(block).getByRole('button', { name: /^Гости: / }).textContent).toBe('2 гостя')
  })
})

// hotel-page, Requirement: Панель цены
describe('PriceBar', () => {
  const bar = () => screen.getByRole('region', { name: 'Цена' })

  it('without dates shows the cheapest night of the next 7 days for the guests', () => {
    render(<HotelPage hotel={hotel} />)
    expect(bar().querySelector('s')!.textContent).toBe(`Обычная цена ${formatPrice(cheapest)}`)
    expect(bar().textContent).toContain(`Цена GURU ${formatPrice(guruPrice(cheapest))}`)
    expect(within(bar()).getByText('за 1 ночь, для 2 гостей')).toBeDefined()
  })

  it('with dates shows the cheapest rate for the stay', () => {
    renderLocal({ checkIn: '2026-10-22', checkOut: '2026-10-25', guests: { adults: 3, children: 0, rooms: 2 } })
    const total = stayTotal(cheapest, '2026-10-22', '2026-10-25', 2)
    expect(bar().querySelector('s')!.textContent).toBe(`Обычная цена ${formatPrice(total)}`)
    expect(bar().textContent).toContain(`Цена GURU ${formatPrice(guruPrice(total))}`)
    expect(within(bar()).getByText('за 3 ночи, для 3 гостей')).toBeDefined()
  })

  it('"Выбрать номер" scrolls to the rooms and moves focus there', async () => {
    const user = userEvent.setup()
    render(<HotelPage hotel={hotel} />)
    const rooms = screen.getByRole('region', { name: 'Номера' })
    rooms.scrollIntoView = vi.fn()

    await user.click(within(bar()).getByRole('button', { name: 'Выбрать номер' }))

    expect(rooms.scrollIntoView).toHaveBeenCalled()
    expect(document.activeElement).toBe(rooms)
  })

  // hotel-page, Requirement: Панель цены (Широкий экран)
  it('sticks to the bottom only below md and ends the page from md, after the rooms, without a shadow', () => {
    render(<HotelPage hotel={hotel} />)
    const classes = bar().className.split(/\s+/)
    expect(classes).toEqual(
      expect.arrayContaining(['max-md:sticky', 'max-md:bottom-0', 'max-md:shadow-(--shadow-card)']),
    )
    expect(classes.filter((c) => /^(sticky|fixed|shadow|bg-|rounded)/.test(c))).toEqual([])
    const rooms = screen.getByRole('region', { name: 'Номера' })
    expect(rooms.compareDocumentPosition(bar()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(bar().parentElement!.lastElementChild).toBe(bar())
  })
})

// hotel-page, Requirement: Плоская страница отеля
describe('HotelPage', () => {
  // site-header, Requirement: Оформление шапки — Страница отеля
  it('marks the page so the layout header turns transparent with white icons in the server HTML', () => {
    render(<HotelPage hotel={hotel} />)
    expect(screen.getByRole('main').hasAttribute('data-header-photo')).toBe(true)
  })

  it('stands on the page background: the heart beside the name, no white blocks around the sections', () => {
    render(<HotelPage hotel={hotel} />)
    const main = screen.getByRole('main')
    // The photo across the screen, then the column.
    expect(main.children).toHaveLength(2)
    expect(main.children[0]).toBe(screen.getByRole('region', { name: 'Фотографии отеля' }))
    const title = screen.getByRole('heading', { level: 1, name: hotel.name })
    expect(within(title.parentElement!).getByRole('button', { name: /избранное/i })).toBeDefined()
    expect(main.querySelectorAll('section.bg-card, section.rounded-2xl, header.bg-card')).toHaveLength(0)
    expect(main.querySelector('[class*="max-w-2xl"]')).toBeNull()
  })

  it('shows the filled stars with "N-звёздочный отель" and the address, without the cancellation, rating or distance line', () => {
    const three = { ...hotel, stars: 3 as const, rating: 9.5, reviewCount: 598 }
    render(<HotelPage hotel={three} />)
    const header = screen.getByRole('heading', { level: 1 }).closest('header')!
    expect(within(header).getByRole('img', { name: '3 звезды' }).querySelectorAll('svg')).toHaveLength(3)
    expect(header.textContent).toContain('3-звёздочный отель')
    expect(header.textContent).toContain(hotel.address)
    expect(header.textContent).not.toContain('9,5')
    expect(header.textContent).not.toContain('от центра')
    expect(screen.queryByText('Бесплатная отмена')).toBeNull()
  })

  it('names the kind of a stay that is not a hotel, and shows no stars for apartments', () => {
    const villa = fullHotelsIn('prague').find((h) => h.stayType === 'villa')!
    render(<HotelPage hotel={villa} />)
    const header = screen.getByRole('heading', { level: 1 }).closest('header')!
    expect(header.textContent).toContain('Вилла')
    expect(header.textContent).not.toContain('звёздочный')
    expect(within(header).queryByRole('img')).toBeNull()
  })

  it('goes photo, name, rating, dates, about, rooms in one column', () => {
    render(<HotelPage hotel={hotel} />)
    const order = [
      screen.getByRole('region', { name: 'Фотографии отеля' }),
      screen.getByRole('heading', { level: 1 }),
      screen.getByRole('region', { name: 'Оценка гостей' }),
      screen.getByRole('region', { name: 'Даты проживания' }),
      screen.getByRole('region', { name: 'Об отеле' }),
      screen.getByRole('region', { name: 'Номера' }),
    ]
    for (let i = 1; i < order.length; i++)
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // hotel-page, Requirement: Отзывы (Без секции)
  it('has no reviews on the page, only "Читать отзывы (N)"', () => {
    render(<HotelPage hotel={hotel} />)
    expect(screen.queryByRole('region', { name: 'Отзывы' })).toBeNull()
    expect(document.getElementById('reviews')).toBeNull()
    expect(screen.queryByText(hotel.reviews[0].pros)).toBeNull()
    expect(screen.getByRole('button', { name: /^Читать отзывы \(/ })).toBeDefined()
  })

  // hotel-page, Requirement: Кнопки страницы отеля
  it('has the three dialog buttons in one look', () => {
    render(<HotelPage hotel={hotel} />)
    const buttons = [/^Показать на карте$/, /^Читать отзывы/, /^Все удобства$/].map((name) =>
      screen.getByRole('button', { name }),
    )
    for (const button of buttons) {
      expect(button.className).toBe(buttons[0].className)
      expect(button.getAttribute('aria-haspopup')).toBe('dialog')
      expect(button.querySelector('svg')).not.toBeNull()
    }
    expect(buttons[0].className).toMatch(/\bbg-secondary\b/)
    expect(buttons[0].className).toMatch(/\brounded-full\b/)
  })

  it('opens the reviews dialog inside the hotel dialog of the results map', async () => {
    const user = userEvent.setup()
    renderLocal({ checkIn: '2026-10-24', checkOut: '2026-10-25', guests })
    await user.click(screen.getByRole('button', { name: /^Читать отзывы/ }))
    expect(screen.getByRole('dialog', { name: 'Отзывы' })).toBeDefined()
  })
})
