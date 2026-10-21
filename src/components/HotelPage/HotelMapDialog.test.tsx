import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fullHotelsIn, getHotel } from '@/lib/catalog'
import { HotelMapDialog } from './HotelMapDialog'

// jsdom has no WebGL: a stand-in map that loads on the next tick and puts the marker into its container.
const mapMock = vi.hoisted(() => ({ options: [] as { center: [number, number] }[] }))
vi.mock('maplibre-gl', () => {
  class Map {
    container: HTMLElement
    constructor(options: { container: HTMLElement; center: [number, number] }) {
      this.container = options.container
      mapMock.options.push(options)
    }
    on() {
      return this
    }
    once() {
      return this
    }
    getContainer() {
      return this.container
    }
    remove() {}
  }
  class Marker {
    element: HTMLElement
    constructor({ element }: { element: HTMLElement }) {
      this.element = element
    }
    setLngLat() {
      return this
    }
    addTo(map: Map) {
      map.container.append(this.element)
      return this
    }
    remove() {
      this.element.remove()
    }
  }
  return { Map, Marker, setWorkerUrl: () => {} }
})

const hotel = getHotel('prague-old-town-lantern')!

// hotel-page, Requirement: Отель на карте
describe('HotelMapDialog', () => {
  it('opens the map with the hotel marker and closes with Escape and "Закрыть", returning focus', async () => {
    const user = userEvent.setup()
    render(<HotelMapDialog hotel={hotel} />)
    const button = screen.getByRole('button', { name: 'Показать на карте' })

    await user.click(button)
    const dialog = screen.getByRole('dialog', { name: hotel.name })
    const map = await within(dialog).findByRole('region', { name: 'Карта' })
    expect(within(map).getByRole('img', { name: hotel.name })).toBeDefined()
    expect(mapMock.options.at(-1)!.center).toEqual([hotel.lon, hotel.lat])

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(button)

    await user.click(button)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Закрыть' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(button)
  })
})

// hotel-page, Requirement: Отель на карте
describe('HotelMapDialog neighbours', () => {
  it('marks the other hotels of the city muted and this one large and on top', async () => {
    const user = userEvent.setup()
    render(<HotelMapDialog hotel={hotel} />)
    await user.click(screen.getByRole('button', { name: 'Показать на карте' }))
    const map = await within(screen.getByRole('dialog')).findByRole('region', { name: 'Карта' })
    const neighbours = fullHotelsIn(hotel.destinationId).filter((h) => h.id !== hotel.id)
    const markers = within(map).getAllByRole('img')
    expect(markers.map((m) => m.getAttribute('aria-label'))).toEqual([...neighbours.map((h) => h.name), hotel.name])
    const own = markers.at(-1)!
    expect(own.getAttribute('aria-current')).toBe('true')
    expect(own.className).toMatch(/\bbg-primary\b/)
    for (const marker of markers.slice(0, -1)) {
      expect(marker.className).not.toMatch(/\bbg-primary\b/)
      expect(marker.hasAttribute('aria-current')).toBe(false)
    }
    // Added last, so drawn above the rest.
    expect(map.lastElementChild!.contains(own)).toBe(true)
  })
})
