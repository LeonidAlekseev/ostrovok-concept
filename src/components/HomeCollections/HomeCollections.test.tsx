import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { hasFreeCancellation } from '../../lib/catalog'
import { loadAllHotels } from '../../lib/catalogSource'
import { homeCollections } from '../../lib/collections'
import { formatPrice } from '../../lib/format'
import { addDays, todayIso } from '../../lib/dates'
import { favoritesStore } from '../../lib/storage'
import { HomeCollections } from './HomeCollections'

afterEach(() => localStorage.clear())

/** The first collection's hotels: a hotel can be in several collections, so queries stay inside one. */
const firstList = (section: HTMLElement) => section.querySelector('ul')!

describe('HomeCollections', () => {
  it('shows every collection with its hotels as links to the hotel page', () => {
    render(<HomeCollections />)
    const section = screen.getByRole('region', { name: 'Подборки' })
    expect(section.id).toBe('collections')

    for (const { collection, hotels } of homeCollections(loadAllHotels())) {
      const heading = within(section).getByRole('heading', { level: 3, name: collection.title })
      const list = heading.parentElement!.querySelector('ul')!
      expect(within(list).getAllByRole('listitem')).toHaveLength(hotels.length)
      for (const hotel of hotels) {
        const link = within(list).getByRole('link', { name: hotel.name })
        expect(link.getAttribute('href')).toMatch(new RegExp(`^/hotels/${hotel.id}\\?`))
      }
    }
  })

  // home-page, Requirement: Карточка отеля в подборке; hotel-tile, Requirement: Бесплатная отмена на карточке
  it('prices the hotels without "от" and marks free cancellation by the hotel', () => {
    render(<HomeCollections />)
    const [{ hotels }] = homeCollections(loadAllHotels())
    const list = firstList(screen.getByRole('region', { name: 'Подборки' }))
    for (const [i, card] of within(list).getAllByRole('article').entries()) {
      const hotel = hotels[i]
      expect(within(card).getAllByText(/^[\d\s]+₽$/)[0].textContent).toBe(formatPrice(hotel.priceFrom))
      expect(card.textContent).not.toMatch(/(^|\s)от \d/)
      expect(within(card).queryByText('Бесплатная отмена') !== null, hotel.id).toBe(hasFreeCancellation(hotel))
    }
  })

  it('links to the hotel with starts tomorrow, the day after, for two adults in one room', () => {
    render(<HomeCollections />)
    const hotel = homeCollections(loadAllHotels())[0].hotels[0]
    const href = within(firstList(screen.getByRole('region', { name: 'Подборки' })))
      .getByRole('link', {
        name: hotel.name,
      })
      .getAttribute('href')!
    const params = new URL(href, 'http://localhost').searchParams
    const today = todayIso()
    expect(params.get('checkin')).toBe(addDays(today, 1))
    expect(params.get('checkout')).toBe(addDays(today, 2))
    expect(params.get('adults')).toBe('2')
    expect(params.get('rooms')).toBe('1')
  })

  it('toggles a hotel in favourites without opening it', async () => {
    const user = userEvent.setup()
    render(<HomeCollections />)
    const hotel = homeCollections(loadAllHotels())[0].hotels[0]
    const card = within(firstList(screen.getByRole('region', { name: 'Подборки' })))
      .getByRole('link', { name: hotel.name })
      .closest('article')!
    await user.click(within(card).getByRole('button', { name: 'Добавить в избранное' }))
    expect(favoritesStore.get()).toEqual([hotel.id])
    expect(within(card).getByRole('button', { name: 'Убрать из избранного' })).toBeTruthy()
  })
})
