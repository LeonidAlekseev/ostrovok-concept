import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHotel } from '@/lib/catalogGenerator'
import type { HotelDetails } from '@/lib/hotelDetails'
import { HotelPage } from './HotelPage'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/hotels/ota-1',
  useRouter: () => ({ replace: vi.fn() }),
}))

// A real hotel as its row is: no generated reviews, scores or Wi‑Fi speed.
const base = getHotel('prague-old-town-lantern')!
const hotel = {
  ...base,
  id: 'ota-1',
  rating: 8.6,
  reviewCount: 1336,
  wifiMbps: null,
  workspace: false,
  description: 'Отель в центре.\n\nЕсть лифт.',
  reviews: [],
  sectionScores: [],
  guestPhotos: [],
}

const place = (id: number, name: string, kind: string, distanceM: number) => ({
  id,
  name,
  kind,
  distanceM,
  bearingDeg: 90,
  lat: 39.5,
  lon: -0.4,
  transport: kind === 'Станция',
})

const details: HotelDetails = {
  description: [
    { title: 'Расположение', paragraphs: ['Отель в центре Валенсии.'] },
    { title: 'В отеле', paragraphs: ['Есть лифт.'] },
  ],
  amenityGroups: [
    { name: 'Общее', slug: 'has_common_info', amenities: ['Лифт', 'Отель для некурящих'] },
    { name: 'Интернет', slug: 'has_internet', amenities: ['Бесплатный Wi-Fi'] },
  ],
  policies: [{ label: 'Парковка рядом с отелем', value: '22 € за машину в сутки' }],
  notes: 'Стойка регистрации работает до 23:00.',
  facts: { rooms: 140, roomFloors: 6, yearBuilt: null, yearRenovated: null, electricity: null },
  building: { floors: 19, heightM: 60, estimated: false },
  scores: [
    { source: 'ostrovok', rating: 7.7, scale: 10, reviewCount: 9, sections: [{ label: 'Чистота', score: 8 }] },
    { source: 'tripadvisor', rating: 4.5, scale: 5, reviewCount: 1327, sections: [] },
  ],
  reviews: [
    {
      id: 'ota-review-1',
      author: 'Анна',
      date: '2022-08-06',
      score: 8,
      text: 'Тихо и чисто.',
      source: 'tripadvisor',
      helpful: 0,
    },
    {
      id: 'ota-featured-1-1',
      author: 'Олег',
      date: null,
      score: 10,
      pros: 'Вид на площадь.',
      source: 'ostrovok',
      helpful: 0,
    },
  ],
  nearby: Array.from({ length: 10 }, (_, i) =>
    place(i + 1, `Место ${i + 1}`, i === 0 ? 'Станция' : 'Музей', 100 * (i + 1) + 35),
  ),
  viewQuotes: [{ reviewId: 'ota-featured-1-1', source: 'ostrovok', author: 'Олег', text: 'Вид на площадь.' }],
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 20, 12))
})
afterEach(() => vi.useRealTimers())

describe('HotelPage of a real hotel with its Ostrovok page', () => {
  it('shows the description by its parts and the facts, the floors of the rooms apart from the building’s', () => {
    render(<HotelPage hotel={hotel} details={details} />)
    const overview = screen.getByRole('region', { name: 'Обзор' })
    for (const text of ['Расположение', 'Отель в центре Валенсии.', 'В отеле', 'Есть лифт.'])
      expect(within(overview).getByText(text)).toBeDefined()
    const facts = within(overview).getByRole('list', { name: 'Факты об отеле' })
    expect(within(facts).getByText('Номера занимают 6 этажей (по данным отеля)')).toBeDefined()
    expect(within(facts).getByText('В здании 19 этажей (EUBUCCO)')).toBeDefined()
  })

  it('shows no Wi‑Fi speed and the amenities by Ostrovok’s groups', async () => {
    const user = userEvent.setup()
    render(<HotelPage hotel={hotel} details={details} />)
    expect(screen.queryByText(/Мбит\/с/)).toBeNull()
    await user.click(screen.getAllByRole('button', { name: 'Все удобства (3)' })[0])
    const dialog = screen.getByRole('dialog')
    for (const group of ['Общее', 'Интернет']) expect(within(dialog).getByRole('region', { name: group })).toBeDefined()
    expect(within(dialog).getByText('Отель для некурящих')).toBeDefined()
  })

  it('shows the scores by source, the guests’ words about the view and the reviews with their sources', async () => {
    const user = userEvent.setup()
    render(<HotelPage hotel={hotel} details={details} />)
    const rating = screen.getByRole('region', { name: 'Отзывы гостей' })
    expect(within(rating).getByText('Островок')).toBeDefined()
    expect(within(rating).getByText('TripAdvisor')).toBeDefined()
    expect(within(rating).getByRole('list', { name: 'Оценки по разделам: Островок' })).toBeDefined()
    expect(within(rating).getByText('«Вид на площадь.»')).toBeDefined()
    await user.click(within(rating).getByRole('button', { name: /^Читать отзывы \(2\)$/ }))
    const list = screen.getByRole('list', { name: 'Отзывы гостей' })
    expect(
      within(list)
        .getAllByText(/^(Островок|TripAdvisor)$/)
        .map((el) => el.textContent),
      // The dated first.
    ).toEqual(['TripAdvisor', 'Островок'])
    expect(within(list).getByText('Тихо и чисто.')).toBeDefined()
  })

  it('lists the places nearby, the rest under "Все места рядом (N)"', async () => {
    const user = userEvent.setup()
    render(<HotelPage hotel={hotel} details={details} />)
    const location = document.getElementById('location')!
    expect(within(location).queryByText('Места рядом появятся позже')).toBeNull()
    const nearby = within(location).getByRole('region', { name: 'Что рядом' })
    expect(within(nearby).getAllByRole('listitem')).toHaveLength(8)
    expect(within(nearby).getByText('140 м')).toBeDefined()
    await user.click(within(nearby).getByRole('button', { name: 'Все места рядом (10)' }))
    expect(within(nearby).getAllByRole('listitem')).toHaveLength(10)
    expect(within(nearby).getByText('1,0 км')).toBeDefined()
  })

  it('shows the paid services and the hotel’s notes in the rules, never contacts', () => {
    render(<HotelPage hotel={hotel} details={details} />)
    const rules = screen.getByRole('region', { name: 'Правила' })
    expect(within(rules).getByText('Парковка рядом с отелем')).toBeDefined()
    expect(within(rules).getByText('22 € за машину в сутки')).toBeDefined()
    expect(within(rules).getByText('Стойка регистрации работает до 23:00.')).toBeDefined()
    expect(document.body.innerHTML).not.toMatch(/mailto:|tel:/)
  })

  it('shows the row alone without the page: its description, no facts, the places stand-in', () => {
    render(<HotelPage hotel={hotel} />)
    expect(screen.getByText('Отель в центре.')).toBeDefined()
    expect(screen.queryByRole('list', { name: 'Факты об отеле' })).toBeNull()
    expect(screen.getAllByText('Места рядом появятся позже').length).toBeGreaterThan(0)
  })

  it('has no "Об отеле" without a description', () => {
    render(<HotelPage hotel={{ ...hotel, description: '' }} />)
    expect(screen.queryByRole('heading', { name: 'Об отеле' })).toBeNull()
  })
})
