import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { getHotel } from '../../lib/catalogGenerator'
import { PhotoCarousel } from './PhotoCarousel'

const { photos } = getHotel('prague-old-town-lantern')!

// hotel-tile, Requirement: Листание фото карточки
describe('PhotoCarousel', () => {
  it('turns to the next photo and back round with the arrows', async () => {
    const user = userEvent.setup()
    render(<PhotoCarousel photos={photos} />)
    const counter = () => screen.getByText(/^\d+ \/ \d+$/).textContent

    expect(counter()).toBe(`1 / ${photos.length}`)
    expect(screen.getByText(`Фото 1 из ${photos.length}`)).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Следующее фото' }))
    expect(counter()).toBe(`2 / ${photos.length}`)
    await user.click(screen.getByRole('button', { name: 'Предыдущее фото' }))
    await user.click(screen.getByRole('button', { name: 'Предыдущее фото' }))
    expect(counter()).toBe(`${photos.length} / ${photos.length}`)
  })

  // hotel-tile, Requirement: Фокус в карусели фото
  it('keeps the strip out of the Tab order, so Tab goes from the title to the arrows', async () => {
    const user = userEvent.setup()
    render(
      <>
        <a href="/h">Название</a>
        <PhotoCarousel photos={photos} />
      </>,
    )
    expect(screen.getByRole('group').getAttribute('tabindex')).toBe('-1')
    screen.getByRole('link', { name: 'Название' }).focus()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Предыдущее фото' }))
  })

  it('has bare arrows of 44 px, shown on touch screens and on hover and focus elsewhere', () => {
    render(<PhotoCarousel photos={photos} />)
    for (const name of ['Предыдущее фото', 'Следующее фото']) {
      const arrow = screen.getByRole('button', { name })
      expect(arrow.className).toMatch(/\bsize-11\b/)
      expect(arrow.className).not.toMatch(/\b(bg-|border)/)
      expect(arrow.className).toMatch(/drop-shadow/)
      expect(arrow.className).toMatch(/(^|\s)opacity-0(\s|$)/)
      expect(arrow.className).toMatch(/group-hover\/carousel:opacity-100/)
      expect(arrow.className).toMatch(/focus-visible:opacity-100/)
      expect(arrow.className).toMatch(/\[@media\(hover:none\)\]:opacity-100/)
    }
  })

  it('without swipe, keeps the strip from scrolling by touch', () => {
    render(<PhotoCarousel photos={photos} swipe={false} />)
    expect(screen.getByRole('group').className).toMatch(/overflow-x-hidden/)
  })

  it('has no arrows for a single photo', () => {
    render(<PhotoCarousel photos={photos.slice(0, 1)} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('1 / 1')).toBeDefined()
  })
})
