import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { getHotel } from '@/lib/catalogGenerator'
import { formatDecimal } from '@/lib/format'
import { Gallery } from './Gallery'

const hotel = getHotel('prague-old-town-lantern')!

// hotel-page, Requirement: Галерея (Мозаика)
describe('Gallery mosaic', () => {
  const mosaic = () => screen.getByRole('dialog', { name: `${hotel.name}: фотографии` })

  it('the large photo opens the mosaic at itself on the hotel tab, with both tabs counted', async () => {
    const user = userEvent.setup()
    render(<Gallery hotel={hotel} />)
    await user.click(screen.getAllByRole('button', { name: /^Фото \d+: / })[3])
    await user.click(screen.getByRole('button', { name: /^Открыть фото:/ }))

    const tabs = within(mosaic()).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual([
      `Фотографии отеля • ${hotel.photos.length}`,
      `Фотографии гостей • ${hotel.guestPhotos.length}`,
    ])
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[0].className).toMatch(/\bdata-active:border-primary\b/)
    const tiles = within(mosaic()).getAllByRole('button', { name: /^Открыть фото \d+:/ })
    expect(tiles).toHaveLength(hotel.photos.length)
    expect(document.activeElement).toBe(tiles[3])

    await user.click(tabs[1])
    expect(within(mosaic()).getAllByRole('button', { name: /^Открыть фото \d+:/ })).toHaveLength(
      hotel.guestPhotos.length,
    )
  })

  it('has no guests tab without guest photos', async () => {
    const user = userEvent.setup()
    render(<Gallery hotel={{ ...hotel, guestPhotos: [] }} />)
    await user.click(screen.getByRole('button', { name: /^Открыть фото:/ }))
    expect(
      within(mosaic())
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual([`Фотографии отеля • ${hotel.photos.length}`])
  })

  it('lays the photos out in the pattern of six: a pair, a wide one, a tall one beside two', async () => {
    const user = userEvent.setup()
    render(<Gallery hotel={hotel} />)
    await user.click(screen.getByRole('button', { name: /^Открыть фото:/ }))
    const tiles = within(mosaic())
      .getAllByRole('button', { name: /^Открыть фото \d+:/ })
      .map((tile) => tile.parentElement!.className)
    const shape = (className: string) =>
      className.includes('col-span-2') ? 'wide' : className.includes('row-span-2') ? 'tall' : 'tile'
    expect(tiles.slice(0, 12).map(shape)).toEqual([
      ...['tile', 'tile', 'wide', 'tall', 'tile', 'tile'],
      ...['tile', 'tile', 'wide', 'tall', 'tile', 'tile'],
    ])
  })

  it('"Назад" closes the mosaic, and so does the cross, going back over its history entry', async () => {
    const user = userEvent.setup()
    render(<Gallery hotel={hotel} />)
    const length = window.history.length
    await user.click(screen.getByRole('button', { name: /^Открыть фото:/ }))
    expect(window.history.length).toBe(length + 1)
    window.history.back()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(screen.getByRole('button', { name: /^Открыть фото:/ }))
    const back = vi.spyOn(window.history, 'back')
    await user.click(within(mosaic()).getByRole('button', { name: 'Закрыть' }))
    expect(back).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    back.mockRestore()
  })
})

// hotel-page, Requirement: Галерея (Клавиатура)
describe('Gallery viewer', () => {
  const openViewer = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<Gallery hotel={hotel} />)
    await user.click(screen.getByRole('button', { name: /^Открыть фото:/ }))
    const mosaic = screen.getByRole('dialog', { name: `${hotel.name}: фотографии` })
    const first = within(mosaic).getAllByRole('button', { name: /^Открыть фото \d+:/ })[0]
    await user.click(first)
    return { first, viewer: () => screen.getByRole('dialog', { name: hotel.name }) }
  }

  it('switches with the arrow keys, closes with Escape and returns focus to the mosaic photo', async () => {
    const user = userEvent.setup()
    const { first, viewer } = await openViewer(user)
    expect(viewer().textContent).toContain(`Фото 1 из ${hotel.photos.length}`)
    await user.keyboard('{ArrowRight}')
    expect(viewer().textContent).toContain(`Фото 2 из ${hotel.photos.length}`)
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(viewer().textContent).toContain(`Фото ${hotel.photos.length} из`)
    await user.keyboard('{ArrowRight}{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: hotel.name })).toBeNull())
    expect(screen.getByRole('dialog', { name: `${hotel.name}: фотографии` })).toBeDefined()
    expect(document.activeElement).toBe(first)
  })

  it('switches and closes with the buttons', async () => {
    const user = userEvent.setup()
    const { viewer } = await openViewer(user)
    await user.click(within(viewer()).getByRole('button', { name: 'Следующее фото' }))
    expect(viewer().textContent).toContain('Фото 2')
    await user.click(within(viewer()).getByRole('button', { name: 'Закрыть' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: hotel.name })).toBeNull())
  })

  it('a swipe of the viewer selects the photo it stops on', async () => {
    const user = userEvent.setup()
    const { viewer } = await openViewer(user)
    const row = within(viewer()).getAllByRole('img', { hidden: true })[0].parentElement!.parentElement!
    Object.defineProperty(row, 'clientWidth', { value: 600, configurable: true })
    row.scrollLeft = 600 * 4
    fireEvent.scroll(row)
    expect(viewer().textContent).toContain(`Фото 5 из ${hotel.photos.length}`)
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

  it('run from edge to edge, starting and ending at the edge of the text, over the fade of the photo', () => {
    const { unmount } = render(<Gallery hotel={hotel} />)
    const row = thumbnails()[0].closest('ul')!
    const column = 'calc(max((100%-var(--page-max))/2,0px)+var(--page-x))'
    expect(row.className).toContain(`px-[${column}]`)
    expect(row.className).toContain(`scroll-px-[${column}]`)
    expect(row.className).toMatch(/\bsnap-x\b/)
    const fade = screen.getByRole('region', { name: 'Фотографии отеля' }).querySelector('.bg-linear-to-t')!
    expect(fade.className).toContain('from-(--decor-surface-soft)')
    unmount()

    // In the hotel dialog the row starts at the dialog's text.
    render(<Gallery hotel={hotel} inDialog />)
    expect(thumbnails()[0].closest('ul')!.className).toMatch(/\bpx-4\b/)
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
    // The dialog moves focus after it opens, which can lag behind the click on a slow runner.
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('aria-label')).toBe(`Открыть фото 3: ${hotel.photos[2].caption}`),
    )
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
