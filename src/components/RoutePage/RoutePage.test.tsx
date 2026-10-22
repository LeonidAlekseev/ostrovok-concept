import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedRoutes } from '@/data/routes'
import { getHotel, type Hotel } from '@/lib/catalog'
import { formatLongDate } from '@/lib/dates'
import { formatPrice } from '@/lib/format'
import { buildPlan, parseRouteState } from '@/lib/routes'
import { RoutePage } from './RoutePage'

const nav = vi.hoisted(() => ({ query: '', replace: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  usePathname: () => '/routes/prague-culture',
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
}))

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

const TODAY = '2026-11-02'
const route = seedRoutes[0]
const hotels: Record<string, Hotel> = Object.fromEntries(
  route.stops.map(({ hotelId }) => [hotelId, getHotel(hotelId)!]),
)
const [residence, loft] = route.stops.map(({ hotelId }) => hotels[hotelId])
const planOf = (query: string) => buildPlan(route, hotels, parseRouteState(route, new URLSearchParams(query), TODAY))
const lastAddress = () => new URLSearchParams(nav.replace.mock.lastCall![0].split('?')[1])
const renderPage = () => render(<RoutePage route={route} hotels={hotels} />)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 2, 10))
  nav.query = ''
  nav.replace.mockClear()
  nav.push.mockClear()
})
afterEach(() => vi.useRealTimers())

// routes, Requirement: Страница маршрута
describe('RoutePage', () => {
  it('shows the title, the author, the persona and a map marker per stop', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: route.title })).toBeTruthy()
    expect(screen.getByText('Редакция О!Погнали')).toBeTruthy()
    expect(screen.getByText('Культурный отпуск')).toBeTruthy()
    const map = await screen.findByRole('region', { name: 'Карта отелей' }, { timeout: 3000 })
    const plan = planOf('')
    const marker = await within(map).findByRole('button', {
      name: `${residence.name}, ${formatPrice(plan.stays[0].price)}`,
    })
    expect(within(map).getByRole('button', { name: `${loft.name}, ${formatPrice(plan.stays[1].price)}` })).toBeTruthy()
    await userEvent.click(marker)
    expect(nav.push).toHaveBeenCalledWith(
      `/hotels/${residence.id}?checkin=2026-11-03&checkout=2026-11-06&adults=2&rooms=1`,
    )
  })

  it('lays out the plan by day, from the arrival to the departure', () => {
    renderPage()
    const days = within(screen.getByRole('list', { name: 'План по дням' })).getAllByRole('heading', { level: 3 })
    expect(days).toHaveLength(6)
    expect(days[0].textContent).toContain('День 1')
    expect(screen.getByText('Прибытие: Аэропорт Вацлава Гавела')).toBeTruthy()
    expect(screen.getByText('Отъезд: Главный вокзал Праги')).toBeTruthy()
  })

  it('keeps the leisure out of the main costs', () => {
    renderPage()
    const plan = planOf('')
    expect(plan.extras).toBeGreaterThan(0)
    expect(screen.getByTestId('route-main').textContent).toContain(formatPrice(plan.main))
    expect(screen.getByTestId('route-extras').textContent).toContain(formatPrice(plan.extras))
    expect(within(screen.getByLabelText('Основные')).queryByText(route.leisure[0].title)).toBeNull()
    expect(within(screen.getByLabelText('Доп. услуги')).getByText(route.leisure[0].title)).toBeTruthy()
  })

  it('repeats the route from the first hotel with the plan’s dates', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Повторить маршрут' }).getAttribute('href')).toBe(
      `/hotels/${residence.id}?checkin=2026-11-03&checkout=2026-11-06&adults=2&rooms=1`,
    )
  })
})

describe('start date', () => {
  it('picks the start in the calendar; past days are unavailable', async () => {
    const { rerender } = renderPage()
    await userEvent.click(screen.getByRole('button', { name: `Дата заезда: ${formatLongDate('2026-11-03')}` }))
    const calendar = await screen.findByRole('dialog', { name: 'Выбор даты заезда' })
    expect(
      within(calendar).getByRole<HTMLButtonElement>('button', { name: formatLongDate('2026-11-01') }).disabled,
    ).toBe(true)
    await userEvent.click(within(calendar).getByRole('button', { name: formatLongDate('2026-11-10') }))
    expect(lastAddress().get('start')).toBe('2026-11-10')

    nav.query = lastAddress().toString()
    rerender(<RoutePage route={route} hotels={hotels} />)
    expect(screen.getByRole('button', { name: `Дата заезда: ${formatLongDate('2026-11-10')}` })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Повторить маршрут' }).getAttribute('href')).toContain('checkin=2026-11-10')
  })
})

// routes, Requirement: Ночи в точках
describe('nights', () => {
  it('adds a night: the address keeps it, the check-out and the price move', async () => {
    const { rerender } = renderPage()
    const stepper = screen.getByRole('group', { name: `Ночей в ${residence.name}` })
    expect(stepper.textContent).toContain('3 ночи')
    await userEvent.click(within(stepper).getByRole('button', { name: 'Плюс ночь' }))
    expect(lastAddress().get('nights')).toBe('4,2')

    nav.query = lastAddress().toString()
    rerender(<RoutePage route={route} hotels={hotels} />)
    expect(screen.getByRole('group', { name: `Ночей в ${residence.name}` }).textContent).toContain('4 ночи')
    expect(screen.getByRole('link', { name: 'Повторить маршрут' }).getAttribute('href')).toContain(
      'checkout=2026-11-07',
    )
    expect(screen.getByTestId('route-main').textContent).toContain(formatPrice(planOf(nav.query).main))
    expect(planOf(nav.query).main).toBeGreaterThan(planOf('').main)
  })

  it('never goes below one night', () => {
    nav.query = 'nights=1,2'
    renderPage()
    const stepper = screen.getByRole('group', { name: `Ночей в ${residence.name}` })
    expect(within(stepper).getByRole<HTMLButtonElement>('button', { name: 'Минус ночь' }).disabled).toBe(true)
  })
})

// routes, Requirement: Трансферы в таймлайне
describe('transfers', () => {
  const taxiGroup = () => screen.getByRole('group', { name: `Такси: ${residence.name} → ${loft.name}` })

  it('shows each transfer with its mode, time and price', () => {
    renderPage()
    const taxi = planOf('').days[3].items.find((item) => item.kind === 'transfer')
    if (taxi?.kind !== 'transfer') throw new Error('no transfer on day 4')
    expect(taxi.mode).toBe('taxi')
    const group = taxiGroup()
    expect(group.textContent).toContain('Такси')
    expect(group.textContent).toContain(`${taxi.minutes} мин`)
    expect(group.textContent).toContain(formatPrice(taxi.price))
    expect(screen.getByRole('group', { name: /^Трансфер: Аэропорт Вацлава Гавела/ })).toBeTruthy()
  })

  it('replaces the taxi with walking for 0 ₽', async () => {
    const { rerender } = renderPage()
    await userEvent.click(within(taxiGroup()).getByRole('button', { name: /Изменить/ }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Пешком' }))
    expect(lastAddress().get('t')).toBe('1:walk')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())

    nav.query = lastAddress().toString()
    rerender(<RoutePage route={route} hotels={hotels} />)
    const walk = screen.getByRole('group', { name: `Пешком: ${residence.name} → ${loft.name}` })
    expect(walk.textContent).toContain(formatPrice(0))
    expect(screen.getByTestId('route-main').textContent).toContain(formatPrice(planOf(nav.query).main))
  })

  it('removes a transfer from the plan with its price, and brings it back', async () => {
    const { rerender } = renderPage()
    await userEvent.click(within(taxiGroup()).getByRole('button', { name: /Изменить/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Убрать из плана' }))
    expect(lastAddress().get('t')).toBe('1:none')

    nav.query = lastAddress().toString()
    rerender(<RoutePage route={route} hotels={hotels} />)
    expect(screen.queryByRole('group', { name: `Такси: ${residence.name} → ${loft.name}` })).toBeNull()
    expect(planOf(nav.query).main).toBeLessThan(planOf('').main)
    expect(screen.getByTestId('route-main').textContent).toContain(formatPrice(planOf(nav.query).main))
    await userEvent.click(screen.getByRole('button', { name: 'Вернуть трансфер' }))
    expect(lastAddress().get('t')).toBeNull()
  })
})

// routes, Requirement: Экспорт в календарь
describe('calendar', () => {
  it('downloads the plan with the edits as an .ics with reminders', async () => {
    nav.query = 't=1:walk'
    const blobs: Blob[] = []
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob)
      return 'blob:plan'
    })
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('opognali-prague-culture.ics')
      expect(this.href).toBe('blob:plan')
    })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Добавить в календарь' }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(blobs[0].type).toBe('text/calendar;charset=utf-8')
    const text = await blobs[0].text()
    expect(text).toMatch(/^BEGIN:VCALENDAR\r\n/)
    expect(text).toContain('TRIGGER:-P1D')
    expect(text).toContain('TRIGGER:-PT1H')
    expect(text.replace(/\r\n /g, '')).toContain(`SUMMARY:Пешком: ${residence.name} → ${loft.name}`)
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:plan'))
    click.mockRestore()
  })
})
