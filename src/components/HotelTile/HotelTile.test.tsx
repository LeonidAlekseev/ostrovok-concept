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
