import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fullHotelsIn, getHotel } from '@/lib/catalogGenerator'
import { formatPrice } from '@/lib/format'
import { lowestPrice } from '@/lib/offer'
import { todayIso } from '@/lib/dates'
import type { Stay } from '@/lib/search'
import { StayContext, noDates } from './stayContext'
import { HotelMapDialog } from './HotelMapDialog'

// jsdom has no WebGL: a stand-in map that loads on the next tick and puts the markers into its container.
const mapMock = vi.hoisted(() => ({
  options: [] as { center: [number, number]; zoom: number }[],
  /** The zoom the map reports: far enough by default for every hotel to have its own marker. */
  zoom: 18,
  push: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mapMock.push }) }))
vi.mock('maplibre-gl', () => {
  type Handler = () => void
  class Map {
    container: HTMLElement
    handlers: Record<string, Handler[]> = {}
    constructor(options: { container: HTMLElement; center: [number, number]; zoom: number }) {
      this.container = options.container
      mapMock.options.push(options)
      setTimeout(() => this.handlers.load?.forEach((h) => h()))
    }
    on(type: string, handler: Handler) {
      ;(this.handlers[type] ??= []).push(handler)
      return this
    }
    once() {
      return this
    }
    getContainer() {
      return this.container
    }
    getZoom() {
      return mapMock.zoom
    }
    getCenter() {
      return { lng: 0, lat: 0 }
    }
    easeTo() {}
    fitBounds() {}
    remove() {}
  }
  class Popup {
    setDOMContent() {
      return this
    }
    setLngLat() {
      return this
    }
    addTo() {
      return this
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
  class LngLatBounds {
    extend() {
      return this
    }
  }
  return { Map, Marker, Popup, LngLatBounds, setWorkerUrl: () => {} }
})

const hotel = getHotel('prague-old-town-lantern')!
const others = fullHotelsIn(hotel.destinationId).filter((h) => h.id !== hotel.id)
const guests = { adults: 3, children: 1, rooms: 2 }
const stay: Stay = { checkIn: '2099-03-10', checkOut: '2099-03-13', guests }

const withStay = (value: Stay | null, children: ReactNode) => (
  <StayContext value={{ ...noDates, stay: value, guests: value?.guests ?? guests }}>{children}</StayContext>
)

async function openMap(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Показать на карте' }))
  const dialog = screen.getByRole('dialog', { name: hotel.name })
  const map = await within(dialog).findByRole('region', { name: 'Карта отелей' })
  await within(map).findByRole('button', { name: new RegExp(`^${hotel.name},`) })
  return { dialog, map }
}

beforeEach(() => {
  mapMock.options.length = 0
  mapMock.zoom = 18
  mapMock.push.mockReset()
})

// hotel-page, Requirement: Отель на карте
describe('HotelMapDialog', () => {
  it('opens the results map centred on the hotel, closes with the cross and Escape, returning focus, with no "Закрыть" button', async () => {
    const user = userEvent.setup()
    render(<HotelMapDialog hotel={hotel} trigger={<button type="button">Показать на карте</button>} />)
    const button = screen.getByRole('button', { name: 'Показать на карте' })

    const { dialog } = await openMap(user)
    expect(mapMock.options.at(-1)!.center).toEqual([hotel.lon, hotel.lat])
    // The cross is the only way to close from the dialog itself.
    expect(within(dialog).getAllByRole('button', { name: 'Закрыть' })).toHaveLength(1)
    expect(within(dialog).getByText(hotel.address)).toBeDefined()

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
describe('HotelMapDialog markers', () => {
  it('shows a price marker per hotel of the city, this one ringed and above the rest', async () => {
    const user = userEvent.setup()
    render(withStay(stay, <HotelMapDialog hotel={hotel} trigger={<button type="button">Показать на карте</button>} />))
    const { map } = await openMap(user)

    const markers = within(map).getAllByRole('button')
    const label = (h: typeof hotel) => `${h.name}, ${formatPrice(lowestPrice(h, stay, guests.rooms, todayIso()))}`
    const labels = markers.map((m) => m.getAttribute('aria-label'))
    // The neighbours in the order of their id, this hotel last.
    expect(labels.slice(0, -1).sort()).toEqual(others.map(label).sort())
    expect(labels.at(-1)).toBe(label(hotel))
    const own = markers.at(-1)!
    expect(own.getAttribute('aria-current')).toBe('true')
    expect(own.className).toMatch(/\bring-primary\b/)
    for (const marker of markers.slice(0, -1)) {
      expect(marker.hasAttribute('aria-current')).toBe(false)
      expect(marker.className).not.toMatch(/\bring-primary\b/)
    }
    // Added last, so drawn above the rest; its element is lifted too.
    expect(map.lastElementChild!.contains(own)).toBe(true)
    expect(own.parentElement!.className).toMatch(/has-data-current:z-2/)
  })

  it('keeps the current hotel out of the groups of its neighbours', async () => {
    mapMock.zoom = 1
    const user = userEvent.setup()
    render(withStay(stay, <HotelMapDialog hotel={hotel} trigger={<button type="button">Показать на карте</button>} />))
    const { map } = await openMap(user)

    const group = within(map).getByRole('button', { name: /приблизить/ })
    expect(group.getAttribute('aria-label')).toMatch(new RegExp(`^${others.length} `))
    expect(within(map).getAllByRole('button')).toHaveLength(2)
    const own = within(map).getByRole('button', { name: new RegExp(`^${hotel.name},`) })
    expect(own.getAttribute('aria-current')).toBe('true')
    expect(group.contains(own)).toBe(false)
  })
})

// hotel-page, Requirement: Отель на карте
describe('HotelMapDialog navigation', () => {
  it('opens another hotel with the dates and guests of the page', async () => {
    const user = userEvent.setup()
    render(withStay(stay, <HotelMapDialog hotel={hotel} trigger={<button type="button">Показать на карте</button>} />))
    const { map } = await openMap(user)

    await user.click(within(map).getByRole('button', { name: new RegExp(`^${others[0].name},`) }))
    const [href] = mapMock.push.mock.calls[0]
    const url = new URL(href, 'http://x')
    expect(url.pathname).toBe(`/hotels/${others[0].id}`)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      checkin: stay.checkIn,
      checkout: stay.checkOut,
      adults: '3',
      children: '1',
      rooms: '2',
    })
  })

  it('without dates shows the night price and passes the guests only', async () => {
    const user = userEvent.setup()
    render(withStay(null, <HotelMapDialog hotel={hotel} trigger={<button type="button">Показать на карте</button>} />))
    const { map } = await openMap(user)

    expect(
      within(map)
        .getByRole('button', { name: new RegExp(`^${others[0].name},`) })
        .getAttribute('aria-label'),
    ).toBe(`${others[0].name}, ${formatPrice(lowestPrice(others[0], null, guests.rooms, todayIso()))}`)
    await user.click(within(map).getByRole('button', { name: new RegExp(`^${others[0].name},`) }))
    const url = new URL(mapMock.push.mock.calls[0][0], 'http://x')
    expect(url.searchParams.has('checkin')).toBe(false)
    expect(url.searchParams.get('adults')).toBe('3')
  })

  it('does not navigate when the current hotel is pressed', async () => {
    const user = userEvent.setup()
    render(withStay(stay, <HotelMapDialog hotel={hotel} trigger={<button type="button">Показать на карте</button>} />))
    const { map } = await openMap(user)

    await user.click(within(map).getByRole('button', { name: new RegExp(`^${hotel.name},`) }))
    expect(mapMock.push).not.toHaveBeenCalled()
  })
})
