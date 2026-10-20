import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { getHotel } from '@/lib/catalog'
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
