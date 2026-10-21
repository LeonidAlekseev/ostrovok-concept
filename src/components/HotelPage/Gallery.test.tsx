import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { getHotel } from '@/lib/catalog'
import { formatDecimal } from '@/lib/format'
import { Gallery } from './Gallery'

const hotel = getHotel('prague-old-town-lantern')!

// hotel-page, Requirement: Галерея
describe('Gallery', () => {
  it('switches with the arrow keys, closes with Escape and returns focus to the photo', async () => {
    const user = userEvent.setup()
    render(<Gallery hotel={hotel} />)
    const first = screen.getByRole('button', { name: /^Открыть фото/ })
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
    await user.click(screen.getByRole('button', { name: /^Открыть фото/ }))
    await user.click(screen.getByRole('button', { name: 'Следующее фото' }))
    expect(screen.getByRole('dialog').textContent).toContain('Фото 2')
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

// hotel-page, Requirement: Галерея (Миниатюра)
describe('Gallery thumbnails', () => {
  const thumbnails = () => screen.getAllByRole('button', { name: /^Фото \d+: / })

  it('show every photo under the large one, the first selected', () => {
    render(<Gallery hotel={hotel} />)
    expect(thumbnails()).toHaveLength(hotel.photos.length)
    expect(thumbnails().map((t) => t.getAttribute('aria-pressed'))).toEqual(hotel.photos.map((_, i) => String(i === 0)))
    expect(screen.getByRole('button', { name: /^Открыть фото/ }).getAttribute('aria-label')).toBe(
      `Открыть фото: ${hotel.photos[0].caption}`,
    )
  })

  it('a thumbnail makes its photo the large one and frames itself', async () => {
    const user = userEvent.setup()
    render(<Gallery hotel={hotel} />)
    await user.click(thumbnails()[2])
    expect(thumbnails()[2].getAttribute('aria-pressed')).toBe('true')
    expect(thumbnails()[2].className).toMatch(/\bborder-primary\b/)
    expect(thumbnails()[0].getAttribute('aria-pressed')).toBe('false')
    const large = screen.getByRole('button', { name: /^Открыть фото/ })
    expect(large.getAttribute('aria-label')).toBe(`Открыть фото: ${hotel.photos[2].caption}`)

    await user.click(large)
    expect(screen.getByRole('dialog').textContent).toContain(`Фото 3 из ${hotel.photos.length}`)
  })

  it('a swipe of the large photos selects the photo it stops on', () => {
    render(<Gallery hotel={hotel} />)
    const large = screen.getByRole('button', { name: /^Открыть фото/ })
    const row = large.parentElement!
    Object.defineProperty(row, 'clientWidth', { value: 360, configurable: true })
    row.scrollLeft = 360 * 3
    fireEvent.scroll(row)
    expect(thumbnails()[3].getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /^Открыть фото/ }).getAttribute('aria-label')).toBe(
      `Открыть фото: ${hotel.photos[3].caption}`,
    )
  })
})

// hotel-page, Requirement: Галерея (Телефон)
describe('Gallery without badges', () => {
  it('has only the large photo and the thumbnails: no badges, counter, rating or favourite toggle', () => {
    render(<Gallery hotel={hotel} />)
    const gallery = screen.getByRole('region', { name: 'Фотографии отеля' })
    const buttons = within(gallery).getAllByRole('button')
    expect(buttons).toHaveLength(hotel.photos.length + 1)
    for (const button of buttons) expect(button.getAttribute('aria-label')).toMatch(/^(Открыть фото|Фото \d+): /)
    expect(gallery.textContent).not.toContain(formatDecimal(hotel.rating))
    expect(gallery.textContent).not.toContain('Бесплатная отмена')
    expect(gallery.textContent).not.toMatch(/\d+ \/ \d+/)
  })
})
