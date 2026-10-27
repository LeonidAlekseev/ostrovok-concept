import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHotel } from '@/lib/catalogGenerator'
import type { HotelNoise as HotelNoiseData, NoiseIndicator } from '@/lib/noise'
import { HotelNoise } from './HotelNoise'
import { HotelPage } from './HotelPage'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/hotels/ota-1',
  useRouter: () => ({ replace: vi.fn() }),
}))

// jsdom has no WebGL: the map stands in as the indicator and the contours it was given.
vi.mock('./NoiseMap', () => ({
  default: ({ indicator, contours }: { indicator: NoiseIndicator; contours: { features: unknown[] } | null }) => (
    <div data-testid="noise-map">
      {indicator} {contours?.features.length ?? 'none'}
    </div>
  ),
}))

const hotel = { ...getHotel('prague-old-town-lantern')!, id: 'ota-1' }

const loud: HotelNoiseData = {
  sources: [
    { source: 'industryInAgglomeration', lden: { max: 39 }, lnight: { max: 39 } },
    { source: 'roadsInAgglomeration', lden: { min: 65, max: 69 }, lnight: { min: 55, max: 59 } },
  ],
  places: [{ category: 'bar', name: 'Homenaje', distanceM: 92, lat: 39.47, lon: -0.376 }],
  placesCovered: ['nightclub', 'bar', 'restaurant', 'fast_food', 'tram', 'train_station'],
}

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockResolvedValue(Response.json({ map: { type: 'FeatureCollection', features: [{}, {}] } }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

// hotel-page, Requirement: Шум и окружение настоящего отеля
describe('HotelNoise', () => {
  it('shows the bands as ranges, the day estimate and the hours with their caveat', async () => {
    render(<HotelNoise hotel={hotel} noise={loud} building={{ floors: 5, heightM: 17.6, estimated: true }} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Шум и окружение' })).toBeTruthy()
    const level = screen.getByRole('region', { name: 'Уровень шума у отеля' })
    expect(within(level).getByText('65–69 дБ')).toBeTruthy()
    expect(within(level).getByText(/выше рекомендации ВОЗ \(45 дБ ночью\)/)).toBeTruthy()
    expect(within(level).getAllByText('55–69 дБ')).toHaveLength(2)
    const hours = screen.getByRole('region', { name: 'Шум в течение суток' })
    expect(within(hours).getByRole('img').getAttribute('aria-label')).toMatch(/ночью около 58 дБ/)
    expect(within(hours).getByText(/2002\/49\/EC.*Точность и монотонность не гарантируются\./)).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('noise-map').textContent).toMatch('Lden 2'))
    expect(fetchMock).toHaveBeenCalledWith('/api/hotels/ota-1/noise-map', expect.anything())
  })

  it('lists the EEA layers and the loud places of OSM with their distances', () => {
    render(<HotelNoise hotel={hotel} noise={loud} />)
    const sources = screen.getByRole('region', { name: 'Источники шума' })
    expect(within(sources).getByText('Дороги города')).toBeTruthy()
    expect(within(sources).getByText('65–69 дБ за сутки · 55–59 дБ ночью')).toBeTruthy()
    const places = within(sources).getByRole('list', { name: 'Шумные места рядом' })
    expect(places.textContent).toMatch('Homenaje · бар')
    expect(places.textContent).toMatch('90 м')
    expect(screen.getByRole('link', { name: '© OpenStreetMap' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Карты шума EEA' })).toBeTruthy()
  })

  it('shows in the legend the quiet below 40 dB and the dots of the loud places shown, and nothing of shielding', () => {
    render(<HotelNoise hotel={hotel} noise={loud} building={{ floors: 5, heightM: 17.6, estimated: false }} />)
    expect(screen.getByText('<40')).toBeTruthy()
    expect(screen.queryByText(/не закрашено/i)).toBeNull()
    const dots = screen.getByRole('list', { name: 'Шумные места на карте' })
    expect(
      within(dots)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Бары и клубы'])
    expect(screen.queryByText(/экранир/)).toBeNull()
  })

  it('switches the map to the night', async () => {
    render(<HotelNoise hotel={hotel} noise={loud} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ночью' }))
    expect(screen.getByRole('button', { name: 'Ночью' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('noise-map').textContent).toMatch('Lnight')
  })

  it('marks the estimated building, and says «нет данных EEA», not «тихо», outside the maps', () => {
    render(
      <HotelNoise
        hotel={hotel}
        noise={{ sources: [], places: [], placesCovered: [] }}
        building={{ floors: 5, heightM: 17.6, estimated: true }}
      />,
    )
    expect(screen.getByText(/^Нет данных EEA.*Это не значит, что здесь тихо\.$/)).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Шум в течение суток' })).toBeNull()
    expect(screen.getByText('≈5 этажей, ≈18 м')).toBeTruthy()
    expect(screen.getByText(/EUBUCCO, по оценке модели/)).toBeTruthy()
  })

  it('marks the height alone when only the height is a model’s estimate', () => {
    render(
      <HotelNoise
        hotel={hotel}
        noise={loud}
        building={{ floors: 8, heightM: 30.6, estimated: false, heightEstimated: true }}
      />,
    )
    expect(screen.getByText('8 этажей, ≈31 м')).toBeTruthy()
    expect(screen.getByText(/EUBUCCO, высота по оценке модели/)).toBeTruthy()
  })

  it('draws no hours for open bands', () => {
    render(
      <HotelNoise
        hotel={hotel}
        noise={{
          ...loud,
          sources: [{ source: 'roadsInAgglomeration', lden: { min: 75 }, lnight: { min: 65, max: 69 } }],
        }}
      />,
    )
    expect(screen.getByText(/График не строим/)).toBeTruthy()
    expect(screen.getByText('75 дБ и выше')).toBeTruthy()
  })

  it('is a section of the page with its tab after «Расположение», none without the data', () => {
    const { unmount } = render(<HotelPage hotel={hotel} noise={loud} />)
    const tabs = within(screen.getByRole('navigation', { name: 'Разделы отеля' }))
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(tabs.slice(-3)).toEqual(['Расположение', 'Шум', 'Правила'])
    expect(screen.getByRole('heading', { level: 2, name: 'Шум и окружение' })).toBeTruthy()
    unmount()
    render(<HotelPage hotel={hotel} />)
    expect(screen.queryByRole('heading', { level: 2, name: 'Шум и окружение' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Шум' })).toBeNull()
  })
})
