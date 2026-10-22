import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seedRoutes } from '@/data/routes'
import type { Hotel } from '@/lib/catalog'
import { getHotel } from '@/lib/catalogGenerator'
import { formatPrice } from '@/lib/format'
import { previewPlan } from '@/lib/routes'
import { sessionStore } from '@/lib/session'
import { RoutePage } from './RoutePage'

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }))

// jsdom has no WebGL: a stand-in map that loads on the next tick and puts the markers into its container.
vi.mock('maplibre-gl', () => {
  type Handler = () => void
  class Map {
    container: HTMLElement
    handlers: Record<string, Handler[]> = {}
    constructor(options: { container: HTMLElement }) {
      this.container = options.container
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
      return 18
    }
    getCenter() {
      return { lng: 0, lat: 0 }
    }
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
  return { Map, Popup, Marker, LngLatBounds, setWorkerUrl: () => {} }
})

const route = seedRoutes[0]
const hotels: Record<string, Hotel> = Object.fromEntries(
  route.stops.map(({ hotelId }) => [hotelId, getHotel(hotelId)!]),
)
const [residence, loft] = route.stops.map(({ hotelId }) => hotels[hotelId])
const plan = previewPlan(route, hotels)
const renderPage = () => render(<RoutePage route={route} hotels={hotels} />)

beforeEach(() => nav.push.mockClear())

// routes, Requirements: Страница маршрута, Оценка цены маршрута, Просмотр без правок
describe('RoutePage', () => {
  it('shows the title, the author, the persona and a map marker per stop', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: route.title })).toBeTruthy()
    expect(screen.getByText('Редакция О!Погнали')).toBeTruthy()
    expect(screen.getByText('Культурный отпуск')).toBeTruthy()
    const map = await screen.findByRole('region', { name: 'Карта отелей' }, { timeout: 3000 })
    const marker = await within(map).findByRole('button', {
      name: `${residence.name}, ${formatPrice(plan.stays[0].price)}`,
    })
    expect(within(map).getByRole('button', { name: `${loft.name}, ${formatPrice(plan.stays[1].price)}` })).toBeTruthy()
    await userEvent.click(marker)
    expect(nav.push).toHaveBeenCalledWith(`/hotels/${residence.id}?adults=2&rooms=1`)
  })

  it('lays out the plan by relative day, without calendar dates', () => {
    renderPage()
    const timeline = screen.getByRole('list', { name: 'План по дням' })
    const days = within(timeline).getAllByRole('heading', { level: 3 })
    expect(days.map((day) => day.textContent)).toEqual(['День 1', 'День 2', 'День 3', 'День 4', 'День 5', 'День 6'])
    expect(timeline.textContent).not.toMatch(
      /янв|фев|мар|апр|мая|июн|июл|авг|сен|окт|ноя|дек|\b(пн|вт|ср|чт|пт|сб|вс)\b/,
    )
    expect(screen.getByText('Прибытие: Аэропорт Вацлава Гавела')).toBeTruthy()
    expect(screen.getByText('Отъезд: Главный вокзал Праги')).toBeTruthy()
    expect(within(timeline).getAllByText(/^3 ночи · ≈/)).toHaveLength(1)
  })

  it('shows each transfer with its mode, time and price, and no editing', () => {
    renderPage()
    const taxi = plan.days[3].items.find((item) => item.kind === 'transfer')
    if (taxi?.kind !== 'transfer') throw new Error('no transfer on day 4')
    const group = screen.getByRole('group', { name: `Такси: ${residence.name} → ${loft.name}` })
    expect(group.textContent).toContain(`${taxi.minutes} мин`)
    expect(group.textContent).toContain(`≈ ${formatPrice(taxi.price)}`)
    for (const name of [/Изменить/, 'Плюс ночь', 'Минус ночь', 'Добавить в календарь', /^Дата заезда/])
      expect(screen.queryByRole('button', { name })).toBeNull()
  })

  it('estimates the main costs for the nights at weekday prices, the leisure apart', () => {
    renderPage()
    expect(plan.extras).toBeGreaterThan(0)
    expect(screen.getByTestId('route-main').textContent).toBe(`≈ ${formatPrice(plan.main)} за 5 ночей`)
    expect(screen.getByTestId('route-extras').textContent).toBe(`≈ ${formatPrice(plan.extras)}`)
    expect(within(screen.getByLabelText('Основные')).queryByText(route.leisure[0].title)).toBeNull()
    expect(within(screen.getByLabelText('Доп. услуги')).getByText(route.leisure[0].title)).toBeTruthy()
  })

  it('repeats the route: a guest signs in first, then comes to the copy', () => {
    const { rerender } = renderPage()
    const link = () => screen.getByRole('link', { name: 'Повторить маршрут' }).getAttribute('href')
    expect(link()).toBe('/login?next=%2Ftrip%2Fnew%3Froute%3Dprague-culture')
    sessionStore.set({ name: 'Анна Петрова', email: 'anna@example.com' })
    rerender(<RoutePage route={route} hotels={hotels} />)
    expect(link()).toBe('/trip/new?route=prague-culture')
  })
})
