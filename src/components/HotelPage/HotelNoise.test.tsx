import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHotel } from '@/lib/catalogGenerator'
import type { HotelNoise as HotelNoiseData, NoiseMapIndicator } from '@/lib/noise'
import { HotelNoise } from './HotelNoise'
import { HotelPage } from './HotelPage'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/hotels/ota-1',
  useRouter: () => ({ replace: vi.fn() }),
}))

// jsdom has no WebGL: the map stands in as the indicator and the contours it was given.
vi.mock('./NoiseMap', () => ({
  default: ({ indicator, contours }: { indicator: NoiseMapIndicator; contours: { features: unknown[] } | null }) => (
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
  yard: [
    { source: 'industryInAgglomeration', lden: { max: 39 }, lnight: { max: 39 } },
    { source: 'roadsInAgglomeration', lden: { max: 39 }, lnight: { max: 39 } },
  ],
  zone: { kind: 'building', buildingId: 'b-1', bufferM: 5 },
  places: [{ category: 'bar', name: 'Homenaje', distanceM: 92, lat: 39.47, lon: -0.376 }],
  placesCovered: ['nightclub', 'bar', 'restaurant', 'cafe', 'fast_food', 'tram', 'train_station'],
}
const none: HotelNoiseData = { sources: [], yard: [], zone: null, places: [], placesCovered: [] }

const shape = (source: string, indicator: NoiseMapIndicator, level: number | null) => ({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [] },
  properties: { source, indicator, db_min: level, db_max: level, level },
})
const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockResolvedValue(
    Response.json({
      map: {
        type: 'FeatureCollection',
        features: [shape('roadsInAgglomeration', 'Lday', 64.2), shape('roadsInAgglomeration', 'Lnight', 55)],
      },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

// hotel-page, Requirement: Шум и окружение настоящего отеля
describe('HotelNoise', () => {
  it('shows the estimate at the facade to the street and to the yard by period, with no hours and no caveat of EEA', async () => {
    render(<HotelNoise hotel={hotel} noise={loud} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Шум и окружение' })).toBeTruthy()
    const level = screen.getByRole('region', { name: 'Уровень шума у отеля' })
    expect(within(level).getByRole('heading', { name: 'Фасад на улицу' })).toBeTruthy()
    expect(within(level).getByRole('heading', { name: 'Окна во двор' })).toBeTruthy()
    // The street: the day and the evening 59–69 dB from the roads' bands, the night 55–60 dB.
    expect(within(level).getAllByText('59–69 дБ')).toHaveLength(2)
    expect(within(level).getByText('55–60 дБ')).toBeTruthy()
    expect(
      within(level).getByText(/Ночью у фасада по карте EEA: 55–59 дБ, дороги города; выше рекомендации ВОЗ/),
    ).toBeTruthy()
    expect(
      within(level).getByText(/Заведения рядом \(1 место в 200 м\) дают днём ≈39 дБ, вечером ≈46 дБ, ночью ≈43 дБ/),
    ).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Шум в течение суток' })).toBeNull()
    expect(screen.queryByText(/EEA даёт полосу в 5 дБ/)).toBeNull()
    await waitFor(() => expect(screen.getByTestId('noise-map').textContent).toMatch('Lday 2'))
    expect(fetchMock).toHaveBeenCalledWith('/api/hotels/ota-1/noise-map', expect.anything())
  })

  it('tells how it counts in «Как мы считаем», the sources last, with no block of the sources and no building', () => {
    render(<HotelNoise hotel={hotel} noise={loud} />)
    const method = screen.getByText('Как мы считаем').closest('details')!
    const items = within(method)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(items[0]).toMatch(/^Фасад на улицу — для каждого источника карт шума EEA/)
    expect(items.join(' ')).toMatch(/L = Lref − 20·lg\(d\/10\)/)
    expect(items.join(' ')).toMatch(/Не учитываем экранирование зданиями/)
    expect(items.at(-1)).toMatch(
      /^Источники: Карты шума EEA по директиве 2002\/49\/EC, раунд 2022: полосы Lden и Lnight; EUBUCCO v0\.2/,
    )
    expect(within(method).getByRole('link', { name: 'Карты шума EEA' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Источники данных' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Здание отеля' })).toBeNull()
    // EUBUCCO is named only in «Как мы считаем».
    const section = screen.getByRole('region', { name: 'Шум и окружение' })
    expect(section.textContent!.replace(method.textContent!, '')).not.toMatch(/EUBUCCO/)
  })

  it('lists the EEA layers and the loud places of OSM with their distances', () => {
    render(<HotelNoise hotel={hotel} noise={loud} />)
    const sources = screen.getByRole('region', { name: 'Источники шума' })
    expect(within(sources).getByText('Дороги города')).toBeTruthy()
    expect(within(sources).getByText('На улицу: 65–69 дБ за сутки · 55–59 дБ ночью')).toBeTruthy()
    expect(within(sources).getByText('Во двор: ниже 40 дБ за сутки · ниже 40 дБ ночью')).toBeTruthy()
    const places = within(sources).getByRole('list', { name: 'Шумные места рядом' })
    expect(places.textContent).toMatch('Homenaje · бар')
    expect(places.textContent).toMatch('90 м')
    expect(screen.getByRole('link', { name: '© OpenStreetMap' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Карты шума EEA' })).toBeTruthy()
  })

  it('shows in the legend the quiet below 40 dB and the dots of the loud places shown, and nothing of shielding', () => {
    render(<HotelNoise hotel={hotel} noise={loud} />)
    expect(screen.getByText('<40')).toBeTruthy()
    expect(screen.queryByText(/не закрашено/i)).toBeNull()
    const dots = screen.getByRole('list', { name: 'Шумные места на карте' })
    expect(
      within(dots)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Бары и клубы'])
    expect(within(dots.parentElement!).queryByText(/экранир/)).toBeNull()
  })

  it('shows the day estimate on the map by default and switches it to the night', async () => {
    render(<HotelNoise hotel={hotel} noise={loud} />)
    expect(screen.getByRole('button', { name: 'Днём' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'За сутки' })).toBeNull()
    expect(screen.getByText('Днём, дБ (оценка по Lden и Lnight)')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Ночью' }))
    expect(screen.getByRole('button', { name: 'Ночью' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('noise-map').textContent).toMatch('Lnight')
    expect(screen.getByText('Lnight, дБ (ночью)')).toBeTruthy()
  })

  it('says in the legend only that no colour means no EEA contour or beyond the radius', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        map: { type: 'FeatureCollection', features: [shape('quiet', 'Lday', null), shape('roads', 'Lday', null)] },
      }),
    )
    render(<HotelNoise hotel={hotel} noise={loud} />)
    expect(await screen.findByText(/^Без цвета — нет контура EEA/)).toBeTruthy()
    expect(screen.queryByText(/середина оценки дня/)).toBeNull()
    expect(screen.queryByText(/^Серым/)).toBeNull()
  })

  it('says «нет данных EEA», not «тихо», outside the maps', () => {
    render(<HotelNoise hotel={hotel} noise={none} />)
    expect(screen.getByText(/^Нет данных EEA.*Это не значит, что здесь тихо\.$/)).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Уровень шума у отеля' })).toBeNull()
  })

  it('keeps an open band open: «от 70 дБ» at night', () => {
    render(
      <HotelNoise
        hotel={hotel}
        noise={{
          ...loud,
          sources: [{ source: 'roadsInAgglomeration', lden: { min: 75 }, lnight: { min: 70 } }],
        }}
      />,
    )
    const level = screen.getByRole('region', { name: 'Уровень шума у отеля' })
    expect(within(level).getAllByText('от 70 дБ').length).toBeGreaterThan(0)
    expect(screen.getByText('На улицу: 75 дБ и выше за сутки · 70 дБ и выше ночью')).toBeTruthy()
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
