import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cheapestRate, fullHotelsIn, getHotel } from '@/lib/catalog'
import { formatPrice } from '@/lib/format'
import { guruPrice, stayTotal } from '@/lib/offer'
import type { Stay } from '@/lib/search'
import { HotelHeader } from './HotelHeader'
import { HotelPage } from './HotelPage'

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
describe('HotelHeader rating', () => {
  it('shows the rating, its word and the review count, and leads to the reviews', async () => {
    const user = userEvent.setup()
    render(
      <>
        <HotelHeader hotel={{ ...hotel, rating: 9.1, reviewCount: 1323 }} />
        <section id="reviews" tabIndex={-1} />
      </>,
    )
    const rating = screen.getByRole('button', { name: /^Оценка гостей 9,1, Превосходно, 1\s323 отзыва$/ })
    for (const text of ['9,1', 'Превосходно', '1 323 отзыва']) expect(within(rating).getByText(text)).toBeDefined()
    // The line under the name repeats the rating and the review count.
    expect(screen.getByText(/^9,1$/, { selector: 'b' })).toBeDefined()
    const reviews = document.getElementById('reviews')!
    reviews.scrollIntoView = vi.fn()

    await user.click(rating)

    expect(reviews.scrollIntoView).toHaveBeenCalled()
    expect(document.activeElement).toBe(reviews)
  })
})

// hotel-page, Requirement: Расположение отеля
describe('HotelHeader location', () => {
  it('in a city with a metro shows the distance to the station and its name with a plain "М"', () => {
    render(<HotelHeader hotel={hotel} />)
    expect(screen.getByText(`${hotel.address}`)).toBeDefined()
    expect(screen.getByText(/до центра$/).textContent).toBe(
      `${String(hotel.distanceKm).replace('.', ',')} км до центра`,
    )
    const tile = screen.getByText(`${hotel.metro!.meters} м`).closest('p')!
    expect(tile.textContent).toContain('до метро')
    expect(tile.textContent).toContain(hotel.metro!.station)
    const letter = within(tile).getByText('М')
    // No colour of its own: only size and alignment.
    expect(letter.className).not.toMatch(/\btext-(?!center|2xl)/)
    expect(screen.queryByText(/до остановки транспорта/)).toBeNull()
  })

  it('in a city without a metro shows the stop of the city transport instead', () => {
    render(<HotelHeader hotel={fullHotelsIn('zakynthos')[0]} />)
    expect(screen.getByText(/до остановки транспорта/).textContent).toBe('5 мин до остановки транспорта')
    expect(screen.queryByText(/до метро/)).toBeNull()
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
})

// hotel-page, Requirement: Плоская страница отеля
describe('HotelPage', () => {
  it('stands on the page background: the heart beside the name, no white blocks around the sections', () => {
    render(<HotelPage hotel={hotel} />)
    const main = screen.getByRole('main')
    expect(main.children).toHaveLength(1)
    const title = screen.getByRole('heading', { level: 1, name: hotel.name })
    expect(within(title.parentElement!).getByRole('button', { name: /избранное/i })).toBeDefined()
    expect(main.querySelectorAll('section.bg-card, section.rounded-2xl, header.bg-card')).toHaveLength(0)
    expect(main.querySelector('[class*="max-w-2xl"]')).toBeNull()
  })

  it('shows the stars, the rating, the free cancellation and the distance under the name', () => {
    render(<HotelPage hotel={{ ...hotel, rating: 9.5, reviewCount: 598 }} />)
    const summary = screen.getByRole('heading', { level: 1 }).parentElement!.parentElement!
    expect(within(summary).getByRole('img', { name: /звезд/ })).toBeDefined()
    expect(summary.textContent).toContain('9,5 · 598 отзывов')
    expect(summary.textContent).toContain('от центра')
    expect(summary.textContent).toContain(hotel.address)
  })
})
