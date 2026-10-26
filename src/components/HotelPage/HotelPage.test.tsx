import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AMENITIES, cheapestRate, POPULAR_AMENITIES, workLabels } from '@/lib/catalog'
import { fullHotelsIn, getHotel } from '@/lib/catalogGenerator'
import { formatPrice } from '@/lib/format'
import { guruPrice, stayTotal } from '@/lib/offer'
import type { Stay } from '@/lib/search'
import { scoreColor } from '@/lib/reviews'
import { AboutHotel, HotelAmenities } from './AboutHotel'
import { HotelPage } from './HotelPage'
import { HotelRating } from './HotelRating'
import { WhyGuests } from './WhyGuests'

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
    const block = screen.getByRole('region', { name: 'Отзывы гостей' })
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

  it('shows the rating of a real hotel and "Отзывы появятся позже" without a list, scores or a dialog', () => {
    render(<HotelRating hotel={{ ...rated, id: 'ota-1', reviews: [], sectionScores: [], guestPhotos: [] }} />)
    const block = screen.getByRole('region', { name: 'Отзывы гостей' })
    expect(within(block).getByText('Основано на 1 323 отзывах гостей.')).toBeDefined()
    expect(within(block).getByText('Отзывы появятся позже')).toBeDefined()
    expect(within(block).queryByRole('list', { name: 'Оценки по разделам' })).toBeNull()
    expect(within(block).queryByRole('button', { name: /Читать отзывы/ })).toBeNull()
    expect(within(block).queryByText(/На вашем языке/)).toBeNull()
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
    expect(tile('До центра')).toBe('До центра1,7 кмгорода')
    expect(tile('До метро')).toBe('До метро1,2 кмMůstek')
    expect(screen.queryByText('До транспорта')).toBeNull()
    expect(screen.getByLabelText('Расстояния')).toBeDefined()
    expect(screen.queryByText(/мин/)).toBeNull()
  })

  it('in a city without a metro has only the centre tile', () => {
    render(<AboutHotel hotel={fullHotelsIn('zakynthos')[0]} />)
    expect(screen.getByText('До центра')).toBeDefined()
    expect(screen.queryByText('До метро')).toBeNull()
    expect(screen.queryByText('До аэропорта')).toBeNull()
  })

  // Scenario: Аэропорт Валенсии
  it('in Valencia measures straight to the airport', () => {
    const valencia = { ...hotel, id: 'ota-1', destinationId: 'valencia', lat: 39.4699, lon: -0.3763, metro: null }
    render(<AboutHotel hotel={valencia} />)
    expect(tile('До аэропорта')).toBe('До аэропорта9,3 кмпо прямой')
  })

  it('shows 0,1 km from next door, and has no "км до центра" tile', () => {
    render(<AboutHotel hotel={{ ...hotel, distanceKm: 0.1 }} />)
    expect(tile('До центра')).toContain('0,1 км')
    expect(screen.queryByText(/км до центра/)).toBeNull()
  })
})

// hotel-page, Requirement: Об отеле
describe('AboutHotel', () => {
  it('shows up to 7 tiles of the popular amenities in their order, then "Все удобства (N)"', () => {
    const amenities = [...POPULAR_AMENITIES]
    render(<AboutHotel hotel={{ ...hotel, amenities }} />)
    const tiles = within(screen.getByRole('list', { name: 'Популярные удобства' })).getAllByRole('listitem')
    expect(tiles).toHaveLength(8)
    expect(tiles[0].textContent).toBe('Wi‑Fi')
    expect(tiles[6].textContent).toBe(AMENITIES[POPULAR_AMENITIES[6]].label)
    expect(tiles[7].textContent).toBe(`Все удобства (${workLabels(hotel).length + amenities.length})`)
  })

  it('shares the row in equal columns: all the tiles from lg, 3 and "Все удобства" below, words unbroken', () => {
    render(<AboutHotel hotel={{ ...hotel, amenities: ['wifi', 'restaurant'] }} />)
    const list = screen.getByRole('list', { name: 'Популярные удобства' })
    expect(list.style.getPropertyValue('--wide')).toBe('3')
    expect(list.style.getPropertyValue('--narrow')).toBe('3')
    expect(list.className).toContain('lg:grid-cols-[repeat(var(--wide),minmax(0,1fr))]')
    expect(list.innerHTML).not.toMatch(/hyphens-auto|overflow-wrap:anywhere/)
  })

  it('folds a long description on a phone until "Читать полностью"', async () => {
    const user = userEvent.setup()
    render(<AboutHotel hotel={{ ...hotel, description: 'Тихий отель. '.repeat(30) }} />)
    const text = document.getElementById('about-text')!
    expect(screen.getByText(/^Тихий отель/)).toBeDefined()
    expect(text.className).toMatch(/\bmax-md:max-h-\[7\.5lh\]/)
    await user.click(screen.getByRole('button', { name: 'Читать полностью' }))
    expect(text.className).not.toMatch(/max-h-/)
    expect(screen.queryByRole('button', { name: 'Читать полностью' })).toBeNull()
  })

  it('does not fold a short description', () => {
    render(<AboutHotel hotel={{ ...hotel, description: 'Тихий отель.' }} />)
    expect(screen.queryByRole('button', { name: 'Читать полностью' })).toBeNull()
  })
})

describe('HotelAmenities', () => {
  it('shows the Wi‑Fi speed, the workspace and the first popular amenities, in their order', () => {
    render(<HotelAmenities hotel={hotel} />)
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
  })

  // Scenario: Все удобства
  it('"Все удобства (N)" lists every amenity by section, the paid ones marked, and Escape returns focus', async () => {
    const user = userEvent.setup()
    const order = Object.keys(AMENITIES)
    const amenities = [...new Set([...hotel.amenities, 'shuttle', 'spa'] as const)].sort(
      (a, b) => order.indexOf(a) - order.indexOf(b),
    )
    const paidHotel = { ...hotel, amenities }
    render(<HotelAmenities hotel={paidHotel} />)
    const count = workLabels(paidHotel).length + amenities.length
    const button = screen.getByRole('button', { name: `Все удобства (${count})` })
    await user.click(button)
    const dialog = screen.getByRole('dialog', { name: 'Удобства' })
    const items = within(dialog)
      .getAllByRole('listitem')
      .map((li) => li.textContent!.replace('оплачивается отдельно', ''))
    expect(items).toEqual([...workLabels(paidHotel), ...paidHotel.amenities.map((key) => AMENITIES[key].label)])
    expect(items).toHaveLength(count)
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
describe('BookingCard', () => {
  const card = () => screen.getAllByRole('region', { name: 'Цена' })[0]

  // Scenario: Без дат
  it('without dates shows the cheapest night of the next 7 days for the guests', () => {
    render(<HotelPage hotel={hotel} />)
    expect(card().querySelector('s')!.textContent).toBe(`Обычная цена ${formatPrice(cheapest)}`)
    expect(card().textContent).toContain(`Цена GURU ${formatPrice(guruPrice(cheapest))}`)
    expect(within(card()).getByText('за 1 ночь для 2 гостей')).toBeDefined()
    expect(within(card()).getByRole('button', { name: 'Заезд: Выберите' })).toBeDefined()
  })

  it('with dates shows the cheapest rate for the stay, the days and the guests', () => {
    renderLocal({ checkIn: '2026-10-22', checkOut: '2026-10-25', guests: { adults: 3, children: 0, rooms: 2 } })
    const total = stayTotal(cheapest, '2026-10-22', '2026-10-25', 2)
    expect(card().querySelector('s')!.textContent).toBe(`Обычная цена ${formatPrice(total)}`)
    expect(card().textContent).toContain(`Цена GURU ${formatPrice(guruPrice(total))}`)
    expect(within(card()).getByText('за 3 ночи для 3 гостей')).toBeDefined()
    expect(within(card()).getByRole('button', { name: 'Заезд: 22 окт, чт' })).toBeDefined()
    expect(within(card()).getByRole('button', { name: 'Выезд: 25 окт, вс' })).toBeDefined()
    expect(within(card()).getByRole('button', { name: /^Гости: 3 гостя, 2 номера/ })).toBeDefined()
  })

  // Scenario: Выбрать номер
  it('"Забронировать" scrolls to the rooms and moves focus there', async () => {
    const user = userEvent.setup()
    render(<HotelPage hotel={hotel} />)
    const rooms = screen.getByRole('region', { name: 'Номера' })
    rooms.scrollIntoView = vi.fn()

    await user.click(within(card()).getByRole('button', { name: 'Забронировать' }))

    expect(rooms.scrollIntoView).toHaveBeenCalled()
    expect(document.activeElement).toBe(rooms)
  })

  // hotel-page, Requirement: Раскладка панели цены
  it('shows the last day of free cancellation of the cheapest refundable rate, and no "Лучшая цена"', () => {
    const rate = (id: string, pricePerNight: number, daysBefore: number | null) => ({
      ...hotel.rooms[0].rates[0],
      id,
      pricePerNight,
      cancellation: daysBefore === null ? { kind: 'non-refundable' as const } : { kind: 'free' as const, daysBefore },
    })
    const rooms = [{ ...hotel.rooms[0], rates: [rate('a', 3000, null), rate('b', 4000, 2)] }]
    render(
      <HotelPage
        hotel={{ ...hotel, rooms }}
        titleId="t"
        stay={{ value: { checkIn: '2026-10-25', checkOut: '2026-10-26', guests }, onChange: vi.fn() }}
      />,
    )
    expect(within(card()).getByText('Бесплатная отмена до 23 окт, пт')).toBeDefined()
    expect(screen.queryByText(/Лучшая цена/)).toBeNull()
  })

  it('has no cancellation line without dates or without a refundable rate', () => {
    const strict = hotel.rooms.map((room) => ({
      ...room,
      rates: room.rates.map((r) => ({ ...r, cancellation: { kind: 'non-refundable' as const } })),
    }))
    renderLocal({ checkIn: '2026-10-25', checkOut: '2026-10-26', guests })
    expect(screen.getAllByText(/^Бесплатная отмена до/).length).toBeGreaterThan(0)
    render(
      <HotelPage
        hotel={{ ...hotel, rooms: strict }}
        titleId="u"
        stay={{ value: { checkIn: '2026-10-25', checkOut: '2026-10-26', guests }, onChange: vi.fn() }}
      />,
    )
    const cards = screen.getAllByRole('region', { name: 'Цена' })
    expect(within(cards[1]).queryByText(/Бесплатная отмена/)).toBeNull()
  })

  // Scenario: Широкий экран, Телефон
  it('stands in the sticky side column from lg; below lg a button stuck to the bottom opens it in a panel', async () => {
    const user = userEvent.setup()
    render(<HotelPage hotel={hotel} />)
    const aside = screen.getByRole('complementary', { name: 'Бронирование' })
    expect(aside.className).toMatch(/\bhidden\b.*\blg:block\b/)
    expect(aside.firstElementChild!.className).toMatch(/\bsticky\b/)
    expect(within(aside).getByRole('region', { name: 'Цена' })).toBeDefined()

    const open = screen.getByRole('button', { name: 'Выбрать даты' })
    const bar = open.closest('div.sticky')!
    expect(bar.className).toMatch(/\bbottom-0\b/)
    expect(bar.className).toMatch(/\blg:hidden\b/)
    expect(open.querySelector('span')!.className).toMatch(/\btruncate\b/)

    await user.click(open)
    const panel = await screen.findByRole('dialog', { name: 'Бронирование' })
    for (const name of [/^Заезд:/, /^Выезд:/, /^Гости:/, /^Забронировать$/])
      expect(within(panel).getByRole('button', { name })).toBeDefined()
  })

  it('with dates the bottom button reads "Забронировать · <price>"', () => {
    nav.query = 'checkin=2026-10-22&checkout=2026-10-25&adults=2&rooms=1'
    render(<HotelPage hotel={hotel} />)
    const total = stayTotal(cheapest, '2026-10-22', '2026-10-25', 1)
    expect(screen.getByRole('button', { name: `Забронировать · ${formatPrice(guruPrice(total))}` })).toBeDefined()
  })

  // hotel-page, Requirement: Кнопки страницы отеля
  it('in the hotel dialog is one column with the booking card at the end and nothing stuck to the bottom', () => {
    renderLocal({ checkIn: '2026-10-24', checkOut: '2026-10-25', guests })
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Выбрать даты$|^Забронировать ·/ })).toBeNull()
    const rules = screen.getByRole('region', { name: 'Правила' })
    expect(rules.compareDocumentPosition(card()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

// hotel-page, Requirement: Плоская страница отеля
describe('HotelPage', () => {
  // site-header, Requirement: Оформление шапки — Страница отеля
  it('does not mark the page for a transparent header: the photo is not under it', () => {
    render(<HotelPage hotel={hotel} />)
    expect(screen.getByRole('main').hasAttribute('data-header-photo')).toBe(false)
  })

  it('stands on the page background: the heart and "Поделиться" beside the name, no white sections', () => {
    render(<HotelPage hotel={hotel} />)
    const main = screen.getByRole('main')
    const title = screen.getByRole('heading', { level: 1, name: hotel.name })
    const row = title.parentElement!
    expect(within(row).getByRole('button', { name: /избранное/i })).toBeDefined()
    expect(within(row).getByRole('button', { name: 'Поделиться' })).toBeDefined()
    expect(main.querySelectorAll('section[id].bg-card, section[id].rounded-2xl, header.bg-card')).toHaveLength(0)
  })

  // Scenario: Плоско
  it('shows "N-звёздочный отель" with the stars, the address and the score with the reviews, no cancellation badge', () => {
    const three = { ...hotel, stars: 3 as const, rating: 9.5, reviewCount: 598 }
    render(<HotelPage hotel={three} />)
    const header = screen.getByRole('heading', { level: 1 }).closest('header')!
    expect(within(header).getByRole('img', { name: '3 звезды' }).querySelectorAll('svg')).toHaveLength(3)
    expect(header.textContent).toContain('3-звёздочный отель')
    expect(header.textContent).toContain(hotel.address)
    expect(within(header).getByRole('button', { name: /9,5.*Превосходно.*598 отзывов/ })).toBeDefined()
    expect(header.textContent).not.toContain('Бесплатная отмена')
  })

  it.each([
    ['villa', 'Вилла'],
    ['apartments', 'Апартаменты'],
    ['hostel', 'Хостел'],
  ])('names a %s by its kind in the header, not as a hotel', (type, label) => {
    const stay = fullHotelsIn('prague').find((h) => h.stayType === type)!
    render(<HotelPage hotel={stay} />)
    const header = screen.getByRole('heading', { level: 1 }).closest('header')!
    expect(header.textContent).toContain(label)
    expect(header.textContent).not.toContain('звёздочный')
    if (type !== 'hostel') expect(within(header).queryByRole('img')).toBeNull()
  })

  // hotel-page, Requirement: Страница отеля
  it('goes name, photos, tabs, overview, rooms with the dates, amenities, rating, location, rules', () => {
    render(<HotelPage hotel={hotel} />)
    const order = [
      screen.getByRole('heading', { level: 1 }),
      screen.getByRole('region', { name: 'Фотографии отеля' }),
      screen.getByRole('navigation', { name: 'Разделы отеля' }),
      screen.getByRole('region', { name: 'Обзор' }),
      screen.getByRole('region', { name: 'Номера' }),
      screen.getByRole('region', { name: 'Даты проживания' }),
      screen.getByRole('region', { name: 'Удобства' }),
      screen.getByRole('region', { name: 'Отзывы гостей' }),
      document.getElementById('location')!,
      screen.getByRole('region', { name: 'Правила' }),
    ]
    for (let i = 1; i < order.length; i++)
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // hotel-page, Requirement: Отзывы (Без секции)
  it('has no reviews on the page, only "Читать отзывы (N)"', () => {
    render(<HotelPage hotel={hotel} />)
    expect(screen.queryByRole('region', { name: 'Отзывы' })).toBeNull()
    expect(document.getElementById('reviews')).toBeNull()
    expect(screen.queryByText(hotel.reviews[0].pros!)).toBeNull()
    expect(screen.getByRole('button', { name: /^Читать отзывы \(/ })).toBeDefined()
  })

  // hotel-page, Requirement: Кнопки страницы отеля (Один вид)
  it('opens dialogs from the map preview, "Читать отзывы (N)" and "Все удобства (N)"', () => {
    render(<HotelPage hotel={hotel} />)
    const buttons = [
      ...screen.getAllByRole('button', { name: 'Показать на карте' }),
      screen.getByRole('button', { name: /^Читать отзывы/ }),
      ...screen.getAllByRole('button', { name: /^Все удобства \(\d+\)$/ }),
    ]
    expect(buttons).toHaveLength(5)
    for (const button of buttons) expect(button.getAttribute('aria-haspopup')).toBe('dialog')
  })

  it('opens the reviews dialog inside the hotel dialog of the results map', async () => {
    const user = userEvent.setup()
    renderLocal({ checkIn: '2026-10-24', checkOut: '2026-10-25', guests })
    await user.click(screen.getByRole('button', { name: /^Читать отзывы/ }))
    expect(screen.getByRole('dialog', { name: 'Отзывы' })).toBeDefined()
  })

  // hotel-page, Requirement: Вкладки страницы отеля
  it('has the six tabs; "Номера" scrolls to the rooms and is underlined', async () => {
    const user = userEvent.setup()
    render(<HotelPage hotel={{ ...hotel, reviewCount: 1123 }} />)
    const tabs = screen.getByRole('navigation', { name: 'Разделы отеля' })
    expect(tabs.className).toMatch(/\bsticky\b/)
    expect(
      within(tabs)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Обзор', 'Номера', 'Удобства', 'Отзывы (1\u00a0123)', 'Расположение', 'Правила'])
    const rooms = screen.getByRole('region', { name: 'Номера' })
    rooms.scrollIntoView = vi.fn()
    await user.click(within(tabs).getByRole('button', { name: 'Номера' }))
    expect(rooms.scrollIntoView).toHaveBeenCalled()
    expect(within(tabs).getByRole('button', { name: 'Номера' }).getAttribute('aria-current')).toBe('true')
    expect(within(tabs).getByRole('button', { name: 'Обзор' }).getAttribute('aria-current')).toBeNull()
  })

  it('shows the check-in and check-out times in "Правила"', () => {
    render(<HotelPage hotel={hotel} />)
    const rules = screen.getByRole('region', { name: 'Правила' })
    expect(rules.textContent).toBe(`ПравилаЗаездс ${hotel.checkInTime}Выезддо ${hotel.checkOutTime}`)
  })

  // hotel-page, Requirement: Мобильная шапка отеля
  it('has the compact header below lg with "Назад", the name, the heart and "Поделиться"', () => {
    render(<HotelPage hotel={hotel} />)
    const back = screen.getByRole('button', { name: 'Назад' })
    const bar = back.parentElement!
    expect(bar.className).toMatch(/\bfixed\b/)
    expect(bar.className).toMatch(/\blg:hidden\b/)
    expect(bar.textContent).toContain(hotel.name)
    expect(within(bar).getByRole('button', { name: 'Поделиться' })).toBeDefined()
  })

  // hotel-page, Requirement: Места рядом
  it('shows the same "Места рядом появятся позже" in the column and in the side card, and no minutes', () => {
    render(<HotelPage hotel={hotel} />)
    expect(screen.getAllByText('Места рядом появятся позже')).toHaveLength(2)
    expect(screen.getByRole('main').textContent).not.toMatch(/\d мин/)
  })
})

// hotel-page, Requirement: Почему гости выбирают нас
describe('WhyGuests', () => {
  const free = hotel.rooms.map((room) => ({
    ...room,
    rates: room.rates.map((r) => ({ ...r, cancellation: { kind: 'free' as const, daysBefore: 1 } })),
  }))
  const strict = hotel.rooms.map((room) => ({
    ...room,
    rates: room.rates.map((r) => ({ ...r, cancellation: { kind: 'non-refundable' as const } })),
  }))

  it("lists only the hotel's own reasons", () => {
    render(<WhyGuests hotel={{ ...hotel, rating: 9.1, distanceKm: 1.4, rooms: free }} />)
    const block = screen.getByRole('region', { name: 'Почему гости выбирают нас' })
    expect(
      within(block)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Высокая оценка гостей 9,1/10', 'Близко к центру — 1,4 км', 'Бесплатная отмена'])
  })

  // Scenario: Далеко и низкая оценка
  it('is not there for 7,2, 4 km and no free cancellation', () => {
    const { container } = render(<WhyGuests hotel={{ ...hotel, rating: 7.2, distanceKm: 4, rooms: strict }} />)
    expect(container.textContent).toBe('')
  })
})

// hotel-page, Requirement: Поделиться отелем
describe('ShareButton', () => {
  const original = { share: navigator.share, clipboard: navigator.clipboard }
  afterEach(() => {
    Object.defineProperty(navigator, 'share', { value: original.share, configurable: true })
    Object.defineProperty(navigator, 'clipboard', { value: original.clipboard, configurable: true })
  })
  const stay = { checkIn: '2026-10-24', checkOut: '2026-10-25', guests }
  const url = `${window.location.origin}/hotels/${hotel.id}?checkin=2026-10-24&checkout=2026-10-25&adults=2&rooms=1`
  const shareButton = () => screen.getAllByRole('button', { name: 'Поделиться' })[0]

  it('opens the system share sheet with the link, the dates and the guests', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    const user = userEvent.setup()
    renderLocal(stay)
    await user.click(shareButton())
    expect(share).toHaveBeenCalledWith({ title: hotel.name, url })
  })

  // Scenario: Без системного окна
  it('without it copies the link and says "Ссылка скопирована"', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    renderLocal(stay)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await user.click(shareButton())
    expect(writeText).toHaveBeenCalledWith(url)
    expect(await screen.findByText('Ссылка скопирована')).toBeDefined()
  })
})

// hotel-page, Requirement: Плашка сгенерированного отеля
describe('HotelPage generated', () => {
  it('marks a synthetic hotel beside its kind of stay (Scenario: Синтетический отель вне production)', () => {
    render(<HotelPage hotel={hotel} />)
    const header = screen.getByRole('heading', { level: 1 }).closest('header')!
    expect(within(header).getByText('generated')).toBeDefined()
  })

  it('does not mark a real hotel (Scenario: Настоящий отель)', () => {
    render(<HotelPage hotel={{ ...hotel, id: 'ota-9322089' }} />)
    expect(screen.queryByText('generated')).toBeNull()
  })
})

// hotel-page, Requirement: Вкладки страницы отеля
describe('HotelTabs', () => {
  it('runs to the phone edges on the page and in the dialog, and leaves lg alone (Scenario: Вкладки на телефоне)', () => {
    const { unmount } = render(<HotelPage hotel={hotel} />)
    const pageNav = screen.getByRole('navigation', { name: 'Разделы отеля' })
    expect(pageNav.className).toContain('max-lg:-mx-(--page-x)')
    expect(pageNav.querySelector('ul')!.className).toContain('max-lg:px-(--page-x)')
    unmount()

    render(<HotelPage hotel={hotel} titleId="t" />)
    const dialogNav = screen.getByRole('navigation', { name: 'Разделы отеля' })
    expect(dialogNav.className).toContain('max-lg:-mx-4')
    expect(dialogNav.querySelector('ul')!.className).toContain('max-lg:px-4')
  })
})
