import { getDefaultNormalizer, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { type Hotel } from '../../lib/catalog'
import { fullHotelsIn, getHotel } from '../../lib/catalogGenerator'
import { countRu, formatDecimal, formatPrice } from '../../lib/format'
import { HotelTile } from './HotelTile'

const hotel = getHotel('prague-old-town-lantern')!
// Prices keep their no-break spaces.
const exact = { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) }

/** The hotel with every rate non-refundable. */
const nonRefundable: Hotel = {
  ...hotel,
  rooms: hotel.rooms.map((room) => ({
    ...room,
    rates: room.rates.map((rate) => ({ ...rate, cancellation: { kind: 'non-refundable' } })),
  })),
}

afterEach(() => localStorage.clear())

// hotel-tile, Requirement: Метки на фото карточки
describe('HotelTile photo', () => {
  it('lays the free cancellation, the rating, the heart, the counter and the stars over the photos', () => {
    render(<HotelTile hotel={hotel} href={`/hotels/${hotel.id}`} />)
    const card = screen.getByRole('article')
    const photos = within(card).getByRole('group', { name: 'Фото отеля' })
    const carousel = photos.parentElement!
    expect(card.firstElementChild).toBe(carousel)
    expect(carousel.className).toMatch(/\brounded-xl\b/)

    const corners = [
      [within(carousel).getByText('1 / 5').parentElement!, /\bbottom-2\b/, /\bleft-2\b/],
      [
        within(carousel).getByRole('img', { name: countRu(hotel.stars, ['звезда', 'звезды', 'звёзд']) }),
        /\bbottom-2\b/,
        /\bright-2\b/,
      ],
    ] as const
    for (const [badge, y, x] of corners) {
      expect(badge.className).toMatch(y)
      expect(badge.className).toMatch(x)
    }

    const button = within(carousel).getByRole('button', { name: 'Добавить в избранное' })
    const rating = within(carousel).getByText(formatDecimal(hotel.rating))
    expect(rating.textContent).toBe(`Оценка гостей ${formatDecimal(hotel.rating)}`)
    expect(button.previousElementSibling).toBe(rating)
    // The top row: the free cancellation on the left, the rating pushed right, the heart last.
    const top = button.parentElement!
    expect(top.className).toMatch(/\btop-2\b/)
    expect(top.className).toMatch(/\binset-x-2\b/)
    expect(top.firstElementChild).toBe(within(carousel).getByText('Бесплатная отмена'))
    expect(rating.className).toMatch(/\bml-auto\b/)
    expect(top.lastElementChild).toBe(button)
  })
})

describe('HotelTile kind of stay', () => {
  it('labels a hostel with its type and stars, an apartment without stars, and a hotel with neither', () => {
    const find = (type: string) => fullHotelsIn('prague').find((h) => h.stayType === type)!
    const { rerender } = render(<HotelTile hotel={hotel} href="/h" />)
    expect(screen.queryByText(/^(Отель|Хостел|Апартаменты|Вилла) ·$/)).toBeNull()
    rerender(<HotelTile hotel={find('hostel')} href="/h" />)
    expect(screen.getByText('Хостел ·')).toBeDefined()
    expect(screen.getByRole('img', { name: /звезд|звёзд/ })).toBeDefined()
    rerender(<HotelTile hotel={find('apartments')} href="/h" />)
    expect(screen.getByText('Апартаменты ·')).toBeDefined()
    expect(screen.queryByRole('img', { name: /звезд|звёзд/ })).toBeNull()
  })
})

// hotel-tile, Requirement: Листание фото карточки
describe('HotelTile photo links', () => {
  it('lets a photo lead where the name does, without adding a link for the keyboard', () => {
    render(<HotelTile hotel={hotel} href={`/hotels/${hotel.id}`} />)
    const card = screen.getByRole('article')
    expect(within(card).getAllByRole('link')).toHaveLength(1)
    const photoLinks = card.querySelectorAll('a[aria-hidden="true"]')
    expect(photoLinks).toHaveLength(5)
    for (const link of photoLinks) {
      expect(link.getAttribute('href')).toBe(`/hotels/${hotel.id}`)
      expect(link.getAttribute('tabindex')).toBe('-1')
    }
  })
})

// hotel-tile, Requirement: Текст и цены карточки
describe('HotelTile text and prices', () => {
  it('shows the name, the distance to the centre of the city and both prices without "от"', () => {
    render(<HotelTile hotel={hotel} href={`/hotels/${hotel.id}`} />)
    const card = screen.getByRole('article')
    expect(within(card).getByRole('link', { name: hotel.name }).getAttribute('href')).toBe(`/hotels/${hotel.id}`)
    const heading = within(card).getByRole('heading', { level: 3, name: hotel.name })
    expect(heading.nextElementSibling?.textContent).toBe(`${formatDecimal(hotel.distanceKm)} км от центра Праги`)

    expect(within(card).getByText(formatPrice(hotel.priceFrom), exact)).toBeDefined()
    expect(within(card).getByText(formatPrice(Math.round(hotel.priceFrom * 0.9)), exact)).toBeDefined()
    expect(within(card).getByRole('img', { name: 'GURU' })).toBeDefined()
    expect(card.textContent).not.toMatch(/(^|\s)от \d|за ночь|за \d+ ноч/)
  })

  it('prices a given price', () => {
    render(<HotelTile hotel={hotel} href="/" price={5985} />)
    const card = screen.getByRole('article')
    expect(within(card).getByText(formatPrice(5985), exact)).toBeDefined()
    expect(within(card).getByText(formatPrice(5387), exact).textContent).toBe(`Цена GURU ${formatPrice(5387)}`)
  })
})

// hotel-tile, Requirement: Цена за срок на карточке
describe('HotelTile price for a stay', () => {
  it('prices the stay with its nights and guests (Scenario: Цена за срок)', () => {
    render(
      <HotelTile
        hotel={hotel}
        href="/"
        stay={{ total: 50_000, nights: 5, guests: { adults: 2, children: 0, rooms: 1 } }}
      />,
    )
    const card = screen.getByRole('article')
    expect(within(card).getByText(formatPrice(50_000), exact)).toBeDefined()
    expect(within(card).getByText(formatPrice(45_000), exact).textContent).toBe(`Цена GURU ${formatPrice(45_000)}`)
    expect(within(card).getByText('за 5 ночей · 2 гостя')).toBeDefined()
    expect(within(card).queryByText(formatPrice(hotel.priceFrom), exact)).toBeNull()
  })
})

// hotel-tile, Requirement: Бесплатная отмена на карточке
describe('HotelTile free cancellation', () => {
  it('follows the hotel by default', () => {
    render(<HotelTile hotel={nonRefundable} href="/" />)
    expect(screen.queryByText('Бесплатная отмена')).toBeNull()
  })

  it('follows a given rate', () => {
    render(<HotelTile hotel={hotel} href="/" freeCancellation={false} />)
    expect(screen.queryByText('Бесплатная отмена')).toBeNull()
  })
})

// home-page, Requirement: Карточка отеля в подборках
describe('HotelTile plain', () => {
  it('shows the first photo alone, without arrows, counter and badges', () => {
    render(<HotelTile hotel={hotel} href={`/hotels/${hotel.id}`} plain />)
    const card = screen.getByRole('article')
    expect(within(card).queryByRole('group', { name: 'Фото отеля' })).toBeNull()
    expect(within(card).queryByRole('button')).toBeNull()
    expect(within(card).queryByText('1 / 5')).toBeNull()
    expect(within(card).queryByText('Бесплатная отмена')).toBeNull()
    expect(within(card).queryByText(formatDecimal(hotel.rating))).toBeNull()
    expect(within(card).queryByRole('img', { name: countRu(hotel.stars, ['звезда', 'звезды', 'звёзд']) })).toBeNull()

    const photoLinks = card.querySelectorAll('a[aria-hidden="true"]')
    expect(photoLinks).toHaveLength(1)
    expect(photoLinks[0].getAttribute('href')).toBe(`/hotels/${hotel.id}`)
    expect(photoLinks[0].querySelector('[role="img"]')).not.toBeNull()
    expect(card.firstElementChild).toBe(photoLinks[0])
  })

  it('has no favourite button on the photo', () => {
    render(<HotelTile hotel={hotel} href="/" plain />)
    expect(screen.queryByRole('button', { name: 'Добавить в избранное' })).toBeNull()
  })

  it('shows no kind of stay for apartments, but keeps the name, the distance and the prices', () => {
    const apartments = fullHotelsIn('prague').find((h) => h.stayType === 'apartments')!
    render(<HotelTile hotel={apartments} href="/" plain />)
    const card = screen.getByRole('article')
    expect(within(card).queryByText('Апартаменты ·')).toBeNull()
    expect(within(card).getByRole('link', { name: apartments.name })).toBeDefined()
    const heading = within(card).getByRole('heading', { level: 3, name: apartments.name })
    expect(heading.nextElementSibling?.textContent).toBe(`${formatDecimal(apartments.distanceKm)} км от центра Праги`)
    expect(within(card).getByText(formatPrice(apartments.priceFrom), exact)).toBeDefined()
    expect(within(card).getByRole('img', { name: 'GURU' })).toBeDefined()
  })
})

// hotel-tile, Requirement: Плашка generated на карточке
describe('HotelTile generated', () => {
  const real: Hotel = { ...hotel, id: 'ota-9322089' }

  it.each([
    ['the results card', false],
    ['the plain card of the selections', true],
  ])('marks a synthetic hotel on %s (Scenario: Карточка в выдаче)', (_, plain) => {
    render(<HotelTile hotel={hotel} href="/" plain={plain} />)
    expect(screen.getByText('generated').className).toMatch(/\bbg-black\/40\b/)
  })

  it.each([false, true])('does not mark a real hotel, plain: %s (Scenario: Настоящий отель)', (plain) => {
    render(<HotelTile hotel={real} href="/" plain={plain} />)
    expect(screen.queryByText('generated')).toBeNull()
  })
})
