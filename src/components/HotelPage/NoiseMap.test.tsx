import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoiseMap as NoiseMapData } from '@/lib/db/noise'
import type { NoisyPlace } from '@/lib/noise'
import NoiseMap from './NoiseMap'

// jsdom has no WebGL: a stand-in map that keeps its options, layers and data, and puts markers and popups into its
// container.
const mapMock = vi.hoisted(() => ({
  options: [] as Record<string, unknown>[],
  layers: [] as { id: string; type: string }[],
  hidden: [] as string[],
  data: {} as Record<string, { features: { properties: Record<string, unknown> }[] }>,
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

const center = { lat: 39.4695, lon: -0.3663 }
const places: NoisyPlace[] = [
  { category: 'bar', name: 'Homenaje', distanceM: 92, lat: 39.47, lon: -0.366 },
  { category: 'tram', name: null, distanceM: 180, lat: 39.468, lon: -0.367 },
]
const band = (source: string, indicator: 'Lden' | 'Lnight', db_min: number | null) => ({
  type: 'Feature' as const,
  geometry: { type: 'Polygon' as const, coordinates: [] },
  properties: { source, indicator, db_min, db_max: db_min === null ? 39 : db_min + 4 },
})
const contours: NoiseMapData = {
  type: 'FeatureCollection',
  features: [band('roadsInAgglomeration', 'Lden', 60), band('quiet', 'Lden', null), band('quiet', 'Lnight', null)],
}

beforeEach(() => {
  mapMock.options.length = 0
  mapMock.layers.length = 0
  mapMock.hidden.length = 0
  mapMock.rotation.length = 0
  mapMock.data = {}
})

const renderMap = () =>
  render(<NoiseMap center={center} contours={contours} indicator="Lden" places={places} onFail={() => {}} />)

// hotel-page, Requirement: Шум и окружение настоящего отеля
describe('NoiseMap', () => {
  it('is a flat map: no tilt, no turn, the style’s 3D buildings hidden', async () => {
    renderMap()
    await waitFor(() => expect(mapMock.layers.map((l) => l.id)).toContain('noise'))
    expect(mapMock.options[0]).toMatchObject({ pitch: 0, maxPitch: 0, dragRotate: false, touchPitch: false })
    expect(mapMock.rotation.sort()).toEqual(['keyboard', 'touch'])
    expect(mapMock.hidden).toEqual(['building-3d'])
  })

  it('draws the quiet below 40 dB first and the louder bands above it', async () => {
    renderMap()
    await waitFor(() => expect(mapMock.data.noise).toBeDefined())
    expect(mapMock.data.noise.features.map((f) => [f.properties.source, f.properties.db_min])).toEqual([
      ['quiet', null],
      ['roadsInAgglomeration', 60],
    ])
  })

  it('opens the name, the kind and the distance of a loud place from its dot, by click and by keyboard', async () => {
    const user = userEvent.setup()
    renderMap()
    const map = screen.getByRole('region', { name: 'Карта шума вокруг отеля' })
    const bar = await within(map).findByRole('button', { name: 'Homenaje, бар' })
    await user.click(bar)
    expect(bar.getAttribute('aria-expanded')).toBe('true')
    const popup = document.getElementById(bar.getAttribute('aria-describedby')!)!
    expect(popup.textContent).toBe('Homenajeбар · 90 м от отеля')

    await user.keyboard('{Escape}')
    expect(bar.getAttribute('aria-expanded')).toBe('false')

    const tram = within(map).getByRole('button', { name: 'Без названия, остановка трамвая' })
    tram.focus()
    await user.keyboard('{Enter}')
    expect(document.getElementById(tram.getAttribute('aria-describedby')!)!.textContent).toBe(
      'Без названияостановка трамвая · 180 м от отеля',
    )
  })
})
