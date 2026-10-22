import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveTripEdits, similarHotelScores } from '@/app/trip/actions'
import { seedRoutes } from '@/data/routes'
import type { Hotel } from '@/lib/catalog'
import { fullHotelsIn, getHotel } from '@/lib/catalogGenerator'
import { rankHotelAlternatives } from '@/lib/hotelAlternatives'
import { formatPrice } from '@/lib/format'
import { copyRoute, tripPlan } from '@/lib/trip'
import { catalogFetch } from '@/test/catalog'
import { TripPlanPage } from './TripPlanPage'

vi.mock('@/app/trip/actions', () => ({
  saveTripEdits: vi.fn(async () => ({})),
  similarHotelScores: vi.fn(async () => null),
}))
// jsdom has no WebGL; the map is the route page's and tested there.
vi.mock('../RoutePage/RouteMap', () => ({ RouteMap: () => null }))

const TRIP_ID = '7c0b4a52-6c1e-4f43-9d2a-0d6f6f1f2a10'
const trip = copyRoute(seedRoutes[0], '2026-11-02')
const hotels: Record<string, Hotel> = Object.fromEntries(trip.stops.map(({ hotelId }) => [hotelId, getHotel(hotelId)!]))
const plan = tripPlan(trip, hotels)

const renderPage = () =>
  render(<TripPlanPage tripId={TRIP_ID} initialTrip={trip} initialHotels={hotels} city="Прага" />)
const day = (n: number) => screen.getByRole('list', { name: `День ${n}` })
const leisureTitles = (n: number) =>
  within(day(n))
    .queryAllByRole('listitem')
    .filter((li) => li.dataset.kind === 'leisure')
    .map((li) => li.querySelector('p')?.textContent)

beforeEach(() => {
  vi.mocked(saveTripEdits).mockClear()
  vi.mocked(saveTripEdits).mockResolvedValue({})
})

// trip-plan, Requirement: Правки плана
describe('TripPlanPage', () => {
  it('shows the plan by calendar day with the exact price', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Культурный отпуск в Праге' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(6)
    expect(screen.getByTestId('trip-main').textContent).toBe(formatPrice(plan.main))
    expect(screen.getByTestId('trip-extras').textContent).toBe(formatPrice(7700))
    expect(screen.getByText('Сохранено')).toBeTruthy()
  })

  it('a night more adds a day and is saved a moment later (Scenario: Сохранение)', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getAllByRole('button', { name: 'Плюс ночь' })[0])
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(7)
    expect(screen.getByText('Сохраняем…')).toBeTruthy()
    expect(saveTripEdits).not.toHaveBeenCalled()
    await waitFor(() => expect(saveTripEdits).toHaveBeenCalledTimes(1), { timeout: 2000 })
    const [id, edits] = vi.mocked(saveTripEdits).mock.calls[0]
    expect(id).toBe(TRIP_ID)
    expect(edits).toMatchObject({ stops: [{ nights: 4 }, { nights: 2 }] })
    expect(edits).not.toHaveProperty('route')
    await screen.findByText('Сохранено')
  })

  it('a failed save says so and «Повторить» saves again', async () => {
    vi.mocked(saveTripEdits).mockResolvedValueOnce({ error: 'Не удалось сохранить план' })
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getAllByRole('button', { name: 'Минус ночь' })[0])
    expect((await screen.findByRole('alert', {}, { timeout: 2000 })).textContent).toBe('Не удалось сохранить план')
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    await screen.findByText('Сохранено')
    expect(saveTripEdits).toHaveBeenCalledTimes(2)
  })

  it('changes a transfer to walking, removes it and brings it back', async () => {
    const user = userEvent.setup()
    renderPage()
    const leg = plan.days[0].items.find((item) => item.kind === 'transfer')!
    if (leg.kind !== 'transfer') throw new Error('no transfer')
    const name = `${leg.from} → ${leg.to}`
    await user.click(screen.getByRole('button', { name: `Изменить: ${name}` }))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Пешком' }))
    expect(screen.getByRole('group', { name: `Пешком: ${name}` })).toBeTruthy()
    expect(screen.getByTestId('trip-main').textContent).toBe(formatPrice(plan.main - leg.price))

    await user.click(screen.getByRole('button', { name: `Изменить: ${name}` }))
    await user.click(await screen.findByRole('menuitem', { name: 'Убрать из плана' }))
    expect(screen.queryByRole('group', { name: `Пешком: ${name}` })).toBeNull()
    await user.click(within(screen.getByRole('group', { name: `Трансфер убран: ${name}` })).getByRole('button'))
    expect(screen.getByRole('group', { name: `Трансфер: ${name}` })).toBeTruthy()
  })
})

// trip-plan, Requirement: Порядок досуга
describe('the leisure of the plan', () => {
  it('moves an item down from the keyboard and keeps the focus on it', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(leisureTitles(2)).toEqual([
      'Пражский Град и собор Святого Вита',
      'Органный концерт в соборе Святого Николая',
    ])
    screen.getByRole('button', { name: 'Ниже: Пражский Град и собор Святого Вита' }).focus()
    await user.keyboard('{Enter}')
    expect(leisureTitles(2)).toEqual([
      'Органный концерт в соборе Святого Николая',
      'Пражский Град и собор Святого Вита',
    ])
    // The last of the day: «Ниже» is off, the focus goes to «Выше».
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Выше: Пражский Град и собор Святого Вита' }),
    )
    expect(screen.getByLabelText('Время: Органный концерт в соборе Святого Николая')).toHaveProperty('value', '10:00')
  })

  it('moves the concert from day 2 to day 3, the extras the same (Scenario: Перенос на другой день)', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Действия: Органный концерт в соборе Святого Николая' }))
    await user.click(await screen.findByRole('menuitem', { name: 'На день 3' }))
    expect(leisureTitles(2)).toEqual(['Пражский Град и собор Святого Вита'])
    expect(leisureTitles(3)).toEqual(['Музей Альфонса Мухи', 'Органный концерт в соборе Святого Николая'])
    expect(screen.getByTestId('trip-extras').textContent).toBe(formatPrice(7700))
  })

  it('removes an item and changes its time', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Действия: Дегустация в пивоварне У Флеку' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }))
    expect(screen.getByTestId('trip-extras').textContent).toBe(formatPrice(5100))
    const time = screen.getByLabelText('Время: Музей Альфонса Мухи')
    fireEvent.change(time, { target: { value: '15:30' } })
    expect(screen.getByLabelText('Время: Музей Альфонса Мухи')).toHaveProperty('value', '15:30')
  })

  it('«Предложить другое» asks the model only when pressed; an error keeps the item', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(async (input) => {
      if (String(input).startsWith('/api/trips/'))
        return Response.json({ error: 'Не получилось предложить, попробуйте ещё раз' }, { status: 502 })
      return catalogFetch(input as RequestInfo)
    })
    const user = userEvent.setup()
    renderPage()
    expect(fetchMock).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Действия: Музей Альфонса Мухи' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Предложить другое' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Не получилось предложить, попробуйте ещё раз')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/trips/${TRIP_ID}/alternatives`)
    expect(JSON.parse(String(init?.body))).toMatchObject({ leisure: { id: 'l3', day: 3 }, start: '2026-11-03' })

    fetchMock.mockImplementationOnce(async () =>
      Response.json({ options: [{ title: 'Музей Кампа', category: 'Музей', minutes: 90, price: 1200 }] }),
    )
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }))
    await user.click(await screen.findByRole('button', { name: 'Выбрать: Музей Кампа' }))
    expect(leisureTitles(3)).toEqual(['Музей Кампа'])
    expect(screen.getByTestId('trip-extras').textContent).toBe(formatPrice(8000))
  })
})

// trip-plan, Requirement: Замена отеля
describe('the hotel of a stop', () => {
  it('moves up the hotels the traveller’s profile likes, the plan’s hotels sent as the profile', async () => {
    const current = hotels[trip.stops[0].hotelId]
    const plain = rankHotelAlternatives(current, fullHotelsIn('prague')).slice(0, 12)
    const liked = plain.at(-1)!
    vi.mocked(similarHotelScores).mockResolvedValueOnce({ [liked.id]: 1 })
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getAllByRole('button', { name: 'Заменить отель' })[0])
    const list = await screen.findByRole('list', { name: 'Отели на замену' })
    const names = within(list)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('p')!.textContent)
    expect(names.indexOf(liked.name)).toBeLessThan(plain.length - 1)
    expect(similarHotelScores).toHaveBeenCalledWith(
      current.id,
      expect.arrayContaining(trip.stops.map((st) => st.hotelId)),
    )
  })

  it('lists the hotels of the city with the change of the main costs and replaces the hotel', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getAllByRole('button', { name: 'Заменить отель' })[0])
    const list = await screen.findByRole('list', { name: 'Отели на замену' })
    const first = within(list).getAllByRole('listitem')[0]
    const name = first.querySelector('p')!.textContent!
    const difference = within(first).getByTestId('price-difference').textContent!
    await user.click(within(first).getByRole('button', { name: `Выбрать ${name}` }))
    await act(async () => {})
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getAllByRole('link', { name })[0]).toBeTruthy()
    const main = Number(screen.getByTestId('trip-main').textContent!.replace(/\D/g, ''))
    const change =
      difference === 'та же цена' ? 0 : Number(difference.replace(/\D/g, '')) * (difference.startsWith('+') ? 1 : -1)
    expect(main - plan.main).toBe(change)
  })
})
