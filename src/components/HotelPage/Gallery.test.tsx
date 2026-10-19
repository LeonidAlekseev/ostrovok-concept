import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { getHotel } from '@/lib/catalog'
import { Gallery } from './Gallery'

const hotel = getHotel('prague-old-town-lantern')!

// hotel-page, Requirement: Галерея
describe('Gallery', () => {
  it('switches with the arrow keys, closes with Escape and returns focus to the photo', async () => {
    const user = userEvent.setup()
    render(<Gallery hotelName={hotel.name} photos={hotel.photos} />)
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
    render(<Gallery hotelName={hotel.name} photos={hotel.photos} />)
    await user.click(screen.getAllByRole('button', { name: /^Открыть фото/ })[0])
    await user.click(screen.getByRole('button', { name: 'Следующее фото' }))
    expect(screen.getByRole('dialog').textContent).toContain('Фото 2')
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
