import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { getHotel, hasFreeCancellation } from '@/lib/catalog'
import { countRu, formatDecimal } from '@/lib/format'
import { Gallery } from './Gallery'

const hotel = getHotel('prague-old-town-lantern')!

// hotel-page, Requirement: Галерея
describe('Gallery', () => {
  it('switches with the arrow keys, closes with Escape and returns focus to the photo', async () => {
    const user = userEvent.setup()
    render(<Gallery hotel={hotel} />)
    const first = screen.getAllByRole('button', { name: /^Открыть фото/ })[0]
    await user.click(first)
    expect(screen.getByRole('dialog').textContent).toContain(`Фото 1 из ${hotel.photos.length}`)
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('dialog').textContent).toContain(`Фото 2 из ${hotel.photos.length}`)
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('dialog').textContent).toContain(`Фото ${hotel.photos.length} из`)
    await user.keyboard('{ArrowRight}{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(first)
  })

  it('switches and closes with the buttons', async () => {
    const user = userEvent.setup()
    render(<Gallery hotel={hotel} />)
    await user.click(screen.getAllByRole('button', { name: /^Открыть фото/ })[0])
    await user.click(screen.getByRole('button', { name: 'Следующее фото' }))
    expect(screen.getByRole('dialog').textContent).toContain('Фото 2')
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

// hotel-page, Requirement: Галерея (Телефон)
describe('Gallery badges', () => {
  it('lays the badges of the hotel card over the carousel and the main photo of the grid', () => {
    render(<Gallery hotel={hotel} />)
    const carousel = screen.getByRole('group', { name: 'Фото отеля' }).parentElement!
    expect(within(carousel).getByText(`1 / ${hotel.photos.length}`)).toBeDefined()
    expect(within(carousel).getByText(formatDecimal(hotel.rating))).toBeDefined()
    expect(
      within(carousel).getByRole('img', { name: countRu(hotel.stars, ['звезда', 'звезды', 'звёзд']) }),
    ).toBeDefined()
    expect(within(carousel).getByRole('button', { name: /избранное/i })).toBeDefined()
    expect(within(carousel).queryByText('Бесплатная отмена') !== null).toBe(hasFreeCancellation(hotel))
    // The grid has them once, on its main photo.
    expect(screen.getAllByText(formatDecimal(hotel.rating))).toHaveLength(2)
  })
})
