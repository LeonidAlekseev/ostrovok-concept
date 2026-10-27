import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ViewMap, { type MapTarget } from './ViewMap'

// jsdom has no WebGL: a stand-in map that puts markers and popups into its container.
const mapMock = vi.hoisted(() => ({
  options: [] as Record<string, unknown>[],
  layers: [] as { id: string; type: string }[],
  hidden: [] as string[],
  data: {} as Record<string, unknown>,
  rotation: [] as string[],
}))
vi.mock('maplibre-gl', () => {
  type Handler = () => void
  class Map {
    container: HTMLElement
    handlers: Record<string, Handler[]> = {}
    touchZoomRotate = { disableRotation: () => mapMock.rotation.push('touch') }
    keyboard = { disableRotation: () => mapMock.rotation.push('keyboard') }
    constructor(options: { container: HTMLElement }) {
      this.container = options.container
      mapMock.options.push(options)
      setTimeout(() => this.fire('load'))
    }
    fire(type: string) {
      this.handlers[type]?.forEach((h) => h())
    }
    on(type: string, handler: Handler) {
      ;(this.handlers[type] ??= []).push(handler)
      return this
    }
    once(type: string, handler: Handler) {
      return this.on(type, handler)
    }
    getStyle() {
      return {
        sources: {},
        layers: [
          { id: 'building-3d', type: 'fill-extrusion' },
          { id: 'label', type: 'symbol' },
        ],
      }
    }
    setLayoutProperty(id: string) {
      mapMock.hidden.push(id)
    }
    addSource() {}
    addLayer(layer: { id: string; type: string }) {
      mapMock.layers.push(layer)
    }
    getSource(id: string) {
      return { setData: (data: (typeof mapMock.data)[string]) => (mapMock.data[id] = data) }
    }
    off() {
      return this
    }
    easeTo() {}
    setFilter() {}
    setPaintProperty() {}
    getContainer() {
      return this.container
    }
    remove() {}
  }
  class Marker {
    element: HTMLElement
    constructor(options?: { element?: HTMLElement }) {
      this.element = options?.element ?? document.createElement('div')
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
  class Popup {
    content: HTMLElement | null = null
    setDOMContent(content: HTMLElement) {
      this.content = content
      return this
    }
    setLngLat() {
      return this
    }
    addTo(map: Map) {
      map.container.append(this.content!)
      return this
    }
    on() {
      return this
    }
    off() {
      return this
    }
    remove() {
      this.content?.remove()
    }
  }
  return { Map, Marker, Popup, setWorkerUrl: () => {} }
})

const targets: MapTarget[] = [
  {
    name: 'Музей изящных искусств',
    category: 'музей',
    lat: 39.48,
    lon: -0.37,
    distanceM: 1200,
    tone: 'seen',
    verdict: 'видно',
  },
  {
    name: 'Башни Серранос',
    category: 'достопримечательность',
    lat: 39.479,
    lon: -0.375,
    distanceM: 900,
    tone: 'closed',
    verdict: 'закрыто',
  },
]

const renderMap = () =>
  render(
    <ViewMap
      center={{ lat: 39.4735, lon: -0.3799 }}
      buildings={null}
      bearing={0}
      sunsetAzimuth={null}
      sunriseAzimuth={null}
      targets={targets}
      blockers={[]}
      hotelBuilding={null}
      onFail={() => {}}
    />,
  )

// hotel-page, Requirement: Вид из отеля настоящего отеля
describe('ViewMap', () => {
  it('puts a labelled dot on every target, coloured by its verdict', async () => {
    renderMap()
    const map = screen.getByRole('region', { name: 'Карта вида из отеля' })
    const museum = await within(map).findByRole('button', { name: 'Музей изящных искусств, музей: видно' })
    expect(within(map).getAllByRole('button')).toHaveLength(2)
    expect(museum.style.backgroundColor).toBe('rgb(22, 163, 74)')
    expect(
      within(map).getByRole('button', { name: 'Башни Серранос, достопримечательность: закрыто' }).style.backgroundColor,
    ).toBe('rgb(220, 38, 38)')
  })

  it('names the place, its kind, distance and verdict on hover, and on press by click or keyboard', async () => {
    const user = userEvent.setup()
    renderMap()
    const map = screen.getByRole('region', { name: 'Карта вида из отеля' })
    const museum = await within(map).findByRole('button', { name: /^Музей изящных искусств/ })
    await user.hover(museum)
    expect(document.getElementById(museum.getAttribute('aria-describedby')!)!.textContent).toBe(
      'Музей изящных искусствмузей · 1,2 км от отеляИз окна: видно',
    )
    await user.unhover(museum)
    expect(museum.getAttribute('aria-describedby')).toBeNull()

    await user.click(museum)
    expect(museum.getAttribute('aria-expanded')).toBe('true')
    await user.keyboard('{Escape}')
    expect(museum.getAttribute('aria-expanded')).toBe('false')

    const towers = within(map).getByRole('button', { name: /^Башни Серранос/ })
    towers.focus()
    await user.keyboard('{Enter}')
    expect(document.getElementById(towers.getAttribute('aria-describedby')!)!.textContent).toBe(
      'Башни Серраносдостопримечательность · 900 м от отеляИз окна: закрыто',
    )
  })
})
