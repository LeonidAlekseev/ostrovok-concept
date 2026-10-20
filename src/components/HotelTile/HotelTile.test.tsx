import { getDefaultNormalizer, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { getDestination, getHotel } from '../../lib/catalog'
import { countRu, formatDecimal, formatPrice } from '../../lib/format'
import { HotelTile } from './HotelTile'

const hotel = getHotel('prague-old-town-lantern')!
// Prices keep their no-break spaces.
const exact = { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) }

afterEach(() => localStorage.clear())

// home-page, Requirement: Подборки отелей (Scenario: Состав карточки)
describe('HotelTile', () => {
  it('puts the stars on the photo and the name with the city right below it', () => {
    render(<HotelTile hotel={hotel} href={`/hotels/${hotel.id}`} />)
    const card = screen.getByRole('article')
    const photo = within(card).getByRole('img', { name: hotel.photos[0].caption })
    const stars = within(card).getByRole('img', { name: countRu(hotel.stars, ['звезда', 'звезды', 'звёзд']) })
    expect(stars.parentElement).toBe(photo.parentElement)
    expect(stars.className).toMatch(/\bright-2\b/)
    expect(stars.className).toMatch(/\bbottom-2\b/)

    const heading = within(card).getByRole('heading', { level: 3, name: hotel.name })
    expect(heading.nextElementSibling?.textContent).toBe(getDestination(hotel.destinationId)!.name)
    expect(within(card).getByRole('link', { name: hotel.name }).getAttribute('href')).toBe(`/hotels/${hotel.id}`)
  })

  it('shows the price without "за ночь" and the rating next to the favourite button', () => {
    render(<HotelTile hotel={hotel} href={`/hotels/${hotel.id}`} />)
    const card = screen.getByRole('article')
    expect(within(card).getByText(`от ${formatPrice(hotel.priceFrom)}`, exact)).toBeDefined()
    expect(card.textContent).not.toMatch(/за ночь/)

    const button = within(card).getByRole('button', { name: 'Добавить в избранное' })
    const rating = within(card).getByText(formatDecimal(hotel.rating))
    expect(button.previousElementSibling).toBe(rating)
    expect(rating.textContent).toBe(`Оценка гостей ${formatDecimal(hotel.rating)}`)
  })

  it('shows a given price and details between the city and the bottom row', () => {
    render(
      <HotelTile hotel={hotel} href="/" price={12345}>
        <p>за 3 ночи</p>
      </HotelTile>,
    )
    expect(screen.getByText(`от ${formatPrice(12345)}`, exact)).toBeDefined()
    expect(screen.getByText('за 3 ночи')).toBeDefined()
  })
})
