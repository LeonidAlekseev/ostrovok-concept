import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getHotel } from '@/lib/catalogGenerator'
import { boxAround, inBox } from '@/lib/mapBox'
import { allHotels } from '@/test/catalog'
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
  /** The box in view the map reports: west, south, east, north. */
  view: [0, 0, 0, 0] as [number, number, number, number],
  last: null as { fire(type: string): void } | null,
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
      mapMock.last = this
      setTimeout(() => this.fire('load'))
    }
    fire(type: string) {
      this.handlers[type]?.forEach((h) => h())
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
    getBounds() {
      const [west, south, east, north] = mapMock.view
      return { getWest: () => west, getSouth: () => south, getEast: () => east, getNorth: () => north }
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
/** The view of the blocks around the hotel. */
const around = (lon: number, lat: number): [number, number, number, number] => [
  lon - 0.015,
  lat - 0.01,
  lon + 0.015,
  lat + 0.01,
]
const inView = (view: [number, number, number, number]) =>
  allHotels().filter((h) => inBox(boxAround(view), h.lon, h.lat))
const others = inView(around(hotel.lon, hotel.lat)).filter((h) => h.id !== hotel.id)
const guests = { adults: 3, children: 1, rooms: 2 }
const stay: Stay = { checkIn: '2099-03-10', checkOut: '2099-03-13', guests }

const withStay = (value: Stay | null, children: ReactNode) => (
  <StayContext value={{ ...noDates, stay: value, guests: value?.guests ?? guests }}>{children}</StayContext>
)

async function openMap(user: ReturnType<typeof userEvent.setup>, { grouped = false } = {}) {
  await user.click(screen.getByRole('button', { name: 'Показать на карте' }))
  const dialog = screen.getByRole('dialog', { name: hotel.name })
  const map = await within(dialog).findByRole('region', { name: 'Карта отелей' })
  await within(map).findByRole('button', { name: new RegExp(`^${hotel.name},`) })
  // The neighbours in view come a pause after the map loads.
  await within(map).findByRole('button', { name: grouped ? /приблизить/ : new RegExp(`^${others[0].name},`) })
  return { dialog, map }
}

beforeEach(() => {
  mapMock.options.length = 0
  mapMock.zoom = 18
  mapMock.view = around(hotel.lon, hotel.lat)
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
  it('shows a price marker per hotel in view, this one ringed and above the rest', async () => {
    const user = userEvent.setup()
    render(withStay(stay, <HotelMapDialog hotel={hotel} trigger={<button type="button">Показать на карте</button>} />))
    const { map } = await openMap(user)

    const markers = within(map).getAllByRole('button')
    const label = (h: typeof hotel) => `${h.name}, ${formatPrice(lowestPrice(h, stay, guests.rooms, todayIso()))}`
    const labels = markers.map((m) => m.getAttribute('aria-label'))
    // The neighbours in view, this hotel last.
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
    const { map } = await openMap(user, { grouped: true })

    const group = within(map).getByRole('button', { name: /приблизить/ })
    expect(group.getAttribute('aria-label')).toMatch(new RegExp(`^${others.length} `))
    expect(within(map).getAllByRole('button')).toHaveLength(2)
    const own = within(map).getByRole('button', { name: new RegExp(`^${hotel.name},`) })
    expect(own.getAttribute('aria-current')).toBe('true')
    expect(group.contains(own)).toBe(false)
  })
})

// hotel-page, Requirement: Отель на карте
describe('HotelMapDialog loading', () => {
  it('starts at the zoom of the blocks and asks for the hotels of the view, not of the city', async () => {
    const user = userEvent.setup()
    render(withStay(stay, <HotelMapDialog hotel={hotel} trigger={<button type="button">Показать на карте</button>} />))
    await openMap(user)

    expect(mapMock.options.at(-1)!.zoom).toBeGreaterThanOrEqual(15)
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url))
    expect(urls.some((url) => url.includes('destinations='))).toBe(false)
    expect(urls.filter((url) => url.startsWith('/api/hotels?bbox='))).toHaveLength(1)
    expect(others.length).toBeLessThan(allHotels().filter((h) => h.destinationId === hotel.destinationId).length - 1)
  })

  it('loads the hotels of a new view after a move and keeps the ones loaded', async () => {
    const user = userEvent.setup()
    render(withStay(stay, <HotelMapDialog hotel={hotel} trigger={<button type="button">Показать на карте</button>} />))
    const { map } = await openMap(user)

    const far = allHotels().find(
      (h) => h.destinationId === hotel.destinationId && !inBox(boxAround(around(hotel.lon, hotel.lat)), h.lon, h.lat),
    )!
    mapMock.view = around(far.lon, far.lat)
    act(() => mapMock.last!.fire('moveend'))
    expect(await within(map).findByRole('button', { name: new RegExp(`^${far.name},`) })).toBeDefined()
    expect(within(map).getByRole('button', { name: new RegExp(`^${others[0].name},`) })).toBeDefined()
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
