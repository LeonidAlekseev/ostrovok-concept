import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHotel } from '@/lib/catalogGenerator'
import type { HotelDetails } from '@/lib/hotelDetails'
import { RAY_BEARINGS, type HotelView as HotelViewData, type LineBlocker, type SightLine } from '@/lib/view'
import { HotelPage } from './HotelPage'
import { HotelView, LANDMARKS_SHOWN } from './HotelView'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/hotels/ota-1',
  useRouter: () => ({ replace: vi.fn() }),
}))

// jsdom has no WebGL: the map stands in as the side it faces, the buildings it was given, the ones in the way and the
// hotel's.
vi.mock('./ViewMap', () => ({
  default: ({
    bearing,
    buildings,
    blockers,
    hotelBuilding,
    targets,
  }: {
    bearing: number
    buildings: { features: unknown[] } | null
    blockers: string[]
    hotelBuilding: string | null
    targets: { name: string; verdict: string; line: boolean }[]
  }) => (
    <div data-testid="view-map">
      {bearing} {buildings?.features.length ?? 'none'} [{[...new Set(blockers)].join(',')}] {hotelBuilding}
      <ul>
        {targets.map((t) => (
          <li key={t.name}>
            {t.name}: {t.verdict}
            {t.line ? ' (линия)' : ''}
          </li>
        ))}
      </ul>
    </div>
  ),
}))

const hotel = { ...getHotel('prague-old-town-lantern')!, id: 'ota-1', lat: 39.4735, lon: -0.3799 }
const building = { floors: 12, heightM: 36, estimated: false, heightEstimated: true }

/** A building of 45 m, 40–50 m by EUBUCCO's interval: surely in the way of the eyes up to 5 m below its `eyeM`. */
const blocker = (over: Partial<LineBlocker> = {}): LineBlocker => ({
  id: 'b1',
  distanceM: 40,
  heightM: 45,
  heightLowerM: 40,
  heightUpperM: 50,
  estimated: true,
  eyeLowerM: (over.eyeM ?? 40) - 5,
  eyeM: 40,
  eyeUpperM: 45,
  ...over,
})

/** A line surely in the way of every floor of the 12 (the top eye is 34,5 m), or of the eyes up to `eyeUpperM`. */
const line = (over: Partial<SightLine> = {}, eyeM = 40, eyeUpperM = 45, blockers = [blocker()]): SightLine => ({
  distanceM: 1500,
  checked: true,
  crossed: 4,
  coveredM: 1500,
  eyes: [
    { eyeM, eyeLowerM: eyeM - 5, eyeUpperM, blockers },
    { eyeM, eyeLowerM: eyeM - 5, eyeUpperM, blockers },
  ],
  targetBuilding: null,
  ...over,
})

const open = line({}, -3, 0, [])

const view: HotelViewData = {
  window: { source: 'building', floors: 12, storeyM: 3, heightM: 36, estimated: true },
  ownBuilding: 'own',
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
      // Seen above 23 m: from the 9th floor (25,5 m).
      line: line({ distanceM: 4430, coveredM: 4430 }, 20, 23, [
        blocker({ id: 's1', distanceM: 800, heightM: 40, eyeM: 20, eyeUpperM: 23 }),
      ]),
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
      line: line({ distanceM: 450, coveredM: 450 }, -5, -4, []),
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

/** The floor's slider. */
const floorSlider = () =>
  screen.getAllByRole('slider', { hidden: true }).find((s) => s.getAttribute('aria-label') === 'Этаж')!

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
  it('tells the window and from which floor the sea and the landmarks are seen', async () => {
    render(<HotelView hotel={hotel} building={building} roomFloors={null} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Вид из отеля' })).toBeTruthy()
    const window = screen.getByRole('region', { name: 'Положение окна' })
    expect(within(window).getByText('здание 12 этажей, ≈ 36 м (по оценке EUBUCCO)')).toBeTruthy()
    expect(within(window).getByText('окно 12-го этажа, ≈ 34,5 м над землёй')).toBeTruthy()
    expect(floorSlider().getAttribute('aria-valuenow')).toBe('12')
    const sea = screen.getByRole('region', { name: 'Море' })
    await waitFor(() => expect(within(sea).getByText('видно с 9-го этажа')).toBeTruthy())
    expect(within(sea).getByText('Берег в 4,4 км')).toBeTruthy()
    expect(within(sea).getByText('С 12-го этажа — видно')).toBeTruthy()
    expect(within(sea).getByText('С 12-го этажа море видно в 1 из 1 направления на берег.')).toBeTruthy()
    const landmarks = screen.getByRole('region', { name: 'Ориентиры до 3 км' })
    expect(within(landmarks).getByText('Torres de Serranos')).toBeTruthy()
    expect(within(landmarks).getByText('не видно ни с одного этажа')).toBeTruthy()
    expect(within(landmarks).getByText('видно со всех этажей')).toBeTruthy()
    expect(
      within(landmarks).getByText('С 12-го этажа — закрыто зданием ≈ 45 м (по оценке EUBUCCO) в 40 м от отеля'),
    ).toBeTruthy()
    // The sun's ray of the west is closed: its building is in the way.
    await waitFor(() => expect(screen.getByTestId('view-map').textContent).toMatch(/^90 3 \[b1\] own/))
    expect(fetchMock).toHaveBeenCalledWith('/api/hotels/ota-1/view', expect.anything())
    expect(screen.getByRole('link', { name: 'EUBUCCO v0.2' })).toBeTruthy()
  })

  it('shows on the map and the lists what is seen from the floor of the slider, asking nothing more', async () => {
    render(<HotelView hotel={hotel} building={building} roomFloors={null} />)
    const sea = screen.getByRole('region', { name: 'Море' })
    await waitFor(() => expect(within(sea).getByText('С 12-го этажа — видно')).toBeTruthy())
    fireEvent.change(floorSlider(), { target: { value: '3' } })
    expect(screen.getByText('окно 3-го этажа, ≈ 7,5 м над землёй')).toBeTruthy()
    expect(
      within(sea).getByText('С 3-го этажа — закрыто зданием ≈ 40 м (по оценке EUBUCCO) в 800 м от отеля'),
    ).toBeTruthy()
    expect(within(sea).getByText('С 3-го этажа море видно в 0 из 1 направления на берег.')).toBeTruthy()
    // The reach of a target is the same from any floor.
    expect(within(sea).getByText('видно с 9-го этажа')).toBeTruthy()
    expect(screen.getByText('Окно на 3-м этаже на восток')).toBeTruthy()
    // The sea's point is east, the side the page opens on: its building is in the way from the 3rd floor.
    expect(screen.getByTestId('view-map').textContent).toMatch(/\[.*s1.*\]/)
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/view'))).toHaveLength(1)
  })

  // hotel-page, Requirement: Положение окна
  it('picks the side in «Положение окна», opening on the openest, and repeats no verdict of the other blocks', async () => {
    render(<HotelView hotel={hotel} building={building} roomFloors={null} />)
    const window = screen.getByRole('region', { name: 'Положение окна' })
    await waitFor(() =>
      expect(within(window).getByRole('button', { name: 'В' }).getAttribute('aria-pressed')).toBe('true'),
    )
    expect(screen.getByText('Окно на 12-м этаже на восток')).toBeTruthy()
    expect(
      within(window).getByText(/Поверх крыш до 1,5 км с 12-го этажа: 15 из 15 направлений этой стороны/),
    ).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Сторона окон' })).toBeNull()
    expect(screen.queryByText(/с этой стороны нет/)).toBeNull()
    await userEvent.click(within(window).getByRole('button', { name: 'С' }))
    expect(screen.getByTestId('view-map').textContent).toMatch(/^0 /)
    expect(screen.getByText('Окно на 12-м этаже на север')).toBeTruthy()
    expect(within(window).getByText(/с 12-го этажа: 0 из 15/)).toBeTruthy()
    // Torres de Serranos is north: its building in the way is coloured on the map.
    expect(screen.getByTestId('view-map').textContent).toMatch(/\[.*b1.*\]/)
  })

  it('gives the map a dot for the sea and every landmark, a line only on the shown side', async () => {
    render(<HotelView hotel={hotel} building={building} roomFloors={null} />)
    await waitFor(() => expect(screen.getByText('Окно на 12-м этаже на восток')).toBeTruthy())
    const map = screen.getByTestId('view-map')
    // East: lines to the sea's point and La Lonja (75°); Torres de Serranos (north) has a dot only.
    expect(
      within(map)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Берег моря: видно (линия)', 'Ла-Лонха: видно (линия)', 'Torres de Serranos: закрыто'])
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Положение окна' })).getByRole('button', { name: 'С' }),
    )
    expect(
      within(map)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Берег моря: видно', 'Ла-Лонха: видно', 'Torres de Serranos: закрыто (линия)'])
  })

  it('tells the sunset and the sunrise of the date and from which floor the sun is seen', async () => {
    render(<HotelView hotel={hotel} building={building} roomFloors={null} />)
    const sun = screen.getByRole('region', { name: 'Закат и восход' })
    fireEvent.change(within(sun).getByLabelText('Дата'), { target: { value: '2026-06-21' } })
    expect(within(sun).getByText('Закат в 21:32')).toBeTruthy()
    expect(within(sun).getByText('Азимут 302° (северо-запад), за год — от 240° зимой до 302° летом.')).toBeTruthy()
    expect(within(sun).getByText('Восход в 06:35')).toBeTruthy()
    // The rays of the west are closed, those of the east open (the sunrise at 58° is north-east: closed).
    await waitFor(() => expect(within(sun).getAllByText('не видно ни с одного этажа')).toHaveLength(2))
  })

  it('counts the floors the rooms take without exact data of the building', async () => {
    render(<HotelView hotel={hotel} building={null} roomFloors={6} />)
    const window = screen.getByRole('region', { name: 'Положение окна' })
    expect(within(window).getByText('нет точных данных о здании, номера на 6 этажах (Островок)')).toBeTruthy()
    expect(within(window).getByText('окно 6-го этажа, ≈ 16,5 м над землёй')).toBeTruthy()
    expect(floorSlider().getAttribute('max')).toBe('6')
    expect(screen.queryByText(/больше этажей|сомнительн/)).toBeNull()
  })

  // hotel-page, Requirement: Ориентиры вида свёрнуты
  it('shows eight landmarks of twenty and all of them under «Показать все»', async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ({ ...view.landmarks[1], name: `Ориентир ${i + 1}` }))
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/view-map')
        ? Response.json({ map: null })
        : Response.json({ view: { ...view, landmarks: twenty } }),
    )
    render(<HotelView hotel={hotel} building={building} roomFloors={null} />)
    const landmarks = await screen.findByRole('region', { name: 'Ориентиры до 3 км' })
    const all = await within(landmarks).findByRole('button', { name: 'Показать все (20)' })
    expect(within(landmarks).getAllByRole('listitem')).toHaveLength(LANDMARKS_SHOWN)
    expect(all.getAttribute('aria-expanded')).toBe('false')
    expect(all.getAttribute('aria-controls')).toBe('view-landmarks-list')
    await userEvent.click(all)
    expect(within(landmarks).getAllByRole('listitem')).toHaveLength(20)
    const fold = within(landmarks).getByRole('button', { name: 'Свернуть' })
    expect(fold.getAttribute('aria-expanded')).toBe('true')
    await userEvent.click(fold)
    expect(within(landmarks).getAllByRole('listitem')).toHaveLength(LANDMARKS_SHOWN)
  })

  it('has no button for eight landmarks or fewer', async () => {
    render(<HotelView hotel={hotel} building={building} roomFloors={null} />)
    const landmarks = await screen.findByRole('region', { name: 'Ориентиры до 3 км' })
    await waitFor(() => expect(within(landmarks).getAllByRole('listitem')).toHaveLength(2))
    expect(within(landmarks).queryByRole('button')).toBeNull()
  })

  it('says «нет точных данных» with neither the building nor the rooms’ floors and asks nothing', () => {
    render(<HotelView hotel={hotel} building={null} roomFloors={null} />)
    expect(screen.getAllByText('Нет точных данных.')).toHaveLength(2)
    expect(screen.queryByRole('slider', { hidden: true })).toBeNull()
    expect(screen.queryByText(/больше этажей|сомнительн/)).toBeNull()
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
