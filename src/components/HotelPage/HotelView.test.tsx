import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHotel } from '@/lib/catalogGenerator'
import type { HotelDetails } from '@/lib/hotelDetails'
import { RAY_BEARINGS, type HotelView as HotelViewData, type SightLine } from '@/lib/view'
import { HotelPage } from './HotelPage'
import { HotelView } from './HotelView'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/hotels/ota-1',
  useRouter: () => ({ replace: vi.fn() }),
}))

// jsdom has no WebGL: the map stands in as the side it faces and the buildings it was given.
vi.mock('./ViewMap', () => ({
  default: ({ bearing, buildings }: { bearing: number; buildings: { features: unknown[] } | null }) => (
    <div data-testid="view-map">
      {bearing} {buildings?.features.length ?? 'none'}
    </div>
  ),
}))

const hotel = { ...getHotel('prague-old-town-lantern')!, id: 'ota-1', lat: 39.4735, lon: -0.3799 }
const building = { floors: 12, heightM: 36, estimated: false, heightEstimated: true }

const line = (over: Partial<SightLine> = {}): SightLine => ({
  distanceM: 1500,
  checked: true,
  crossed: 4,
  maxAngle: 3,
  maxAngleUpper: 4,
  firstAboveM: 40,
  coveredM: 1500,
  blocker: { id: 'b1', distanceM: 40, heightM: 45, estimated: true },
  targetBuilding: null,
  ...over,
})

const open = line({ maxAngle: -2, maxAngleUpper: -1.5, firstAboveM: null })

const view: HotelViewData = {
  observer: { floor: 12, floors: 12, heightM: 36, heightEstimated: true, eyeM: 34.5 },
  floors: [],
  // Open to the east only.
  rays: RAY_BEARINGS.map((bearing) => ({ bearing, line: bearing >= 69 && bearing <= 111 ? open : line() })),
  sea: [
    {
      kind: 'sea',
      name: 'Берег моря',
      category: 'море',
      lat: 39.46,
      lon: -0.331,
      distanceM: 4430,
      bearing: 100,
      line: line({ distanceM: 4430, coveredM: 4430, maxAngle: -0.5, maxAngleUpper: -0.4 }),
    },
  ],
  seaChecked: true,
  landmarks: [
    {
      kind: 'ostrovok',
      name: 'Ла-Лонха',
      category: 'достопримечательность',
      lat: 39.474,
      lon: -0.378,
      distanceM: 450,
      bearing: 75,
      line: line({ distanceM: 450, coveredM: 450, maxAngle: -5, maxAngleUpper: -4.8 }),
    },
    {
      kind: 'attraction',
      name: 'Torres de Serranos',
      category: 'достопримечательность',
      lat: 39.479,
      lon: -0.376,
      distanceM: 700,
      bearing: 20,
      line: line({ distanceM: 700, coveredM: 700 }),
    },
  ],
  windowSides: [],
}

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockImplementation(async (url: string) =>
    url.includes('/view-map')
      ? Response.json({ map: { type: 'FeatureCollection', features: [{}, {}, {}] } })
      : Response.json({ view }),
  )
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

// hotel-page, Requirement: Вид из отеля настоящего отеля
describe('HotelView', () => {
  it('tells the window, the sea and the landmarks with the three verdicts', async () => {
    render(<HotelView hotel={hotel} building={building} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Вид из отеля' })).toBeTruthy()
    const window = screen.getByRole('region', { name: 'Окно' })
    expect(within(window).getByText('здание 12 этажей, ≈ 36 м (по оценке EUBUCCO)')).toBeTruthy()
    expect(within(window).getByText('окно 12-го этажа, ≈ 34,5 м над землёй')).toBeTruthy()
    const sea = screen.getByRole('region', { name: 'Море' })
    await waitFor(() => expect(within(sea).getByText('вероятно видно')).toBeTruthy())
    expect(within(sea).getByText('Берег в 4,4 км')).toBeTruthy()
    const landmarks = screen.getByRole('region', { name: 'Ориентиры до 3 км' })
    expect(within(landmarks).getByText('Torres de Serranos')).toBeTruthy()
    expect(within(landmarks).getByText('возможны препятствия')).toBeTruthy()
    expect(within(landmarks).getByText(/мешает здание ≈ 45 м \(по оценке EUBUCCO\) в 40 м от отеля/)).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('view-map').textContent).toBe('90 3'))
    expect(fetchMock).toHaveBeenCalledWith('/api/hotels/ota-1/view?floor=12', expect.anything())
    expect(screen.getByRole('link', { name: 'EUBUCCO v0.2' })).toBeTruthy()
  })

  it('opens on the side with the most open rays and turns to the side picked on the compass', async () => {
    render(<HotelView hotel={hotel} building={building} />)
    const side = screen.getByRole('region', { name: 'Сторона окон' })
    await waitFor(() =>
      expect(within(side).getByRole('button', { name: 'В' }).getAttribute('aria-pressed')).toBe('true'),
    )
    expect(within(side).getByText(/Поверх крыш до 1,5 км: 15 из 15 направлений\. Зданий выше окна/)).toBeTruthy()
    expect(within(side).getByRole('list', { name: 'Что видно с этой стороны' }).textContent).toMatch('Ла-Лонха')
    await userEvent.click(within(side).getByRole('button', { name: 'С' }))
    expect(screen.getByTestId('view-map').textContent).toMatch(/^0 /)
    expect(within(side).getByText(/0 из 15 направлений\. Ближайшее здание выше окна — в 40 м\./)).toBeTruthy()
    expect(within(side).getByRole('list', { name: 'Что видно с этой стороны' }).textContent).toMatch(
      'Torres de Serranos',
    )
  })

  it('asks the view of another floor', async () => {
    render(<HotelView hotel={hotel} building={building} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Этаж' }), '3')
    expect(fetchMock).toHaveBeenCalledWith('/api/hotels/ota-1/view?floor=3', expect.anything())
    expect(screen.getByText('окно 3-го этажа, ≈ 7,5 м над землёй')).toBeTruthy()
  })

  it('says «недостаточно данных» without a reliable height and asks nothing', () => {
    render(<HotelView hotel={hotel} building={null} />)
    expect(screen.getByText(/Высоты здания отеля нет в EUBUCCO или она сомнительна/)).toBeTruthy()
    expect(screen.getByText('Недостаточно данных: нет надёжной высоты здания отеля.')).toBeTruthy()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/hotels/ota-1/view-map'])
  })

  it('is a section of the real hotel’s page with its tab, none without the details', () => {
    const details = { building, nearby: [], viewQuotes: [], reviews: [], scores: [] } as unknown as HotelDetails
    const { unmount } = render(<HotelPage hotel={hotel} details={{ ...details, ...emptyDetails }} />)
    const tabs = within(screen.getByRole('navigation', { name: 'Разделы отеля' }))
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(tabs.slice(-3)).toEqual(['Расположение', 'Вид', 'Правила'])
    unmount()
    render(<HotelPage hotel={hotel} />)
    expect(screen.queryByRole('heading', { level: 2, name: 'Вид из отеля' })).toBeNull()
  })
})

const emptyDetails: Omit<HotelDetails, 'building'> = {
  description: [],
  amenityGroups: [],
  policies: [],
  notes: null,
  facts: { rooms: null, roomFloors: null, yearBuilt: null, yearRenovated: null, electricity: null },
  scores: [],
  reviews: [],
  nearby: [],
  viewQuotes: [],
}
