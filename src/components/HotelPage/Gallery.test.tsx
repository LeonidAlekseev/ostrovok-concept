import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { getHotel } from '@/lib/catalogGenerator'
import { Gallery } from './Gallery'

const hotel = getHotel('prague-old-town-lantern')!

// hotel-page, Requirement: Галерея (Мозаика)
describe('Gallery mosaic', () => {
  const mosaic = () => screen.getByRole('dialog', { name: `${hotel.name}: фотографии` })

  it('the large photo opens the mosaic at itself on the hotel tab, with both tabs counted', async () => {
    const user = userEvent.setup()
    render(<Gallery hotel={hotel} />)
    await user.click(screen.getAllByRole('button', { name: /^Фото \d+: / })[3])

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
    await user.click(screen.getAllByRole('button', { name: /^Фото \d+: / })[0])
    expect(
      within(mosaic())
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual([`Фотографии отеля • ${hotel.photos.length}`])
  })

  it('lays the photos out in the pattern of six: a pair, a wide one, a tall one beside two', async () => {
    const user = userEvent.setup()
    render(<Gallery hotel={hotel} />)
    await user.click(screen.getAllByRole('button', { name: /^Фото \d+: / })[0])
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
    await user.click(screen.getAllByRole('button', { name: /^Фото \d+: / })[0])
    expect(window.history.length).toBe(length + 1)
    window.history.back()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(screen.getAllByRole('button', { name: /^Фото \d+: / })[0])
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
    await user.click(screen.getAllByRole('button', { name: /^Фото \d+: / })[0])
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
describe('Gallery tile', () => {
  const tiles = () => screen.getAllByRole('button', { name: /^Фото \d+: / })
  const withPhotos = (n: number) => ({
    ...hotel,
    photos: Array.from({ length: n }, (_, i) => ({ ...hotel.photos[i % hotel.photos.length], id: `p${i}` })),
  })

  it('shows seven photos and "+N фото" over the last when there are more', async () => {
    const user = userEvent.setup()
    const many = withPhotos(10)
    render(<Gallery hotel={many} />)
    expect(tiles()).toHaveLength(7)
    const more = screen.getByRole('button', { name: 'Ещё 3 фото: открыть все' })
    expect(more.textContent).toBe('+3 фото')
    await user.click(more)
    expect(screen.getByRole('dialog', { name: `${hotel.name}: фотографии` })).toBeDefined()
  })

  it('has no "+N фото" with seven photos or fewer', () => {
    render(<Gallery hotel={withPhotos(7)} />)
    expect(tiles()).toHaveLength(7)
    expect(screen.queryByText(/^\+\d+ фото$/)).toBeNull()
  })

  it.each([1, 2, 3, 4, 5, 6])('lays %i photos out without empty cells', (n) => {
    const { container } = render(<Gallery hotel={withPhotos(n)} />)
    expect(tiles()).toHaveLength(n)
    const grid = container.querySelector('.grid-rows-2') as HTMLElement | null
    if (n === 1) return expect(grid).toBeNull()
    const columns = Number(/repeat\((\d)/.exec(grid!.style.gridTemplateColumns)![1])
    const cells = Array.from(grid!.children).reduce(
      (sum, cell) =>
        sum + (cell.className.includes('row-span-2') ? 2 : 1) * (cell.className.includes('col-span-2') ? 2 : 1),
      0,
    )
    expect(cells).toBe(columns * 2)
  })

  it('is flat: no shadow and no gradient over the photos', () => {
    const { container } = render(<Gallery hotel={withPhotos(10)} />)
    const own = Array.from(container.querySelectorAll('section *:not([role="img"], [role="img"] *)'))
    for (const el of own) expect(el.className).not.toMatch(/shadow|gradient|bg-linear/)
  })
})

// hotel-page, Requirement: Галерея (Телефон)
describe('Gallery carousel', () => {
  const slides = () => screen.getAllByRole('button', { name: /^Открыть фото: / })

  it('counts "N / M" and has no row of thumbnails', () => {
    render(<Gallery hotel={hotel} />)
    expect(screen.getByText(`1 / ${hotel.photos.length}`)).toBeDefined()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('a swipe selects the photo under the middle of the strip and updates the counter', () => {
    render(<Gallery hotel={hotel} />)
    const row = slides()[0].parentElement!
    Object.defineProperty(row, 'clientWidth', { value: 360, configurable: true })
    Object.defineProperty(row, 'scrollWidth', { value: 5000, configurable: true })
    slides().forEach((el, i) => {
      Object.defineProperty(el, 'offsetLeft', { value: i * 300, configurable: true })
      Object.defineProperty(el, 'offsetWidth', { value: 290, configurable: true })
    })
    row.scrollLeft = 300
    fireEvent.scroll(row)
    expect(screen.getByText(`2 / ${hotel.photos.length}`)).toBeDefined()
  })

  it('is a horizontal strip only, off both screen edges, the photos one height and uncropped', () => {
    render(<Gallery hotel={hotel} />)
    const row = slides()[0].parentElement!
    expect(row.className).toMatch(/\boverflow-x-auto\b/)
    expect(row.className).toMatch(/\boverflow-y-hidden\b/)
    expect(row.className).toMatch(/\btouch-pan-x\b.*\btouch-pan-y\b/)
    expect(row.className).toMatch(/-mx-\(--page-x\)/)
    expect(slides()[0].className).toMatch(/\bh-full\b/)
    expect(slides()[0].style.aspectRatio).not.toBe('')
  })

  it('a slide opens the mosaic at its photo', async () => {
    const user = userEvent.setup()
    render(<Gallery hotel={hotel} />)
    await user.click(slides()[0])
    expect(screen.getByRole('dialog', { name: `${hotel.name}: фотографии` })).toBeDefined()
  })
})
