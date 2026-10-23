import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { tileHotel } from '../lib/catalog'
import { newHotels } from '../lib/catalogGenerator'
import { PERSONAS, personaHotels } from '../lib/personas'
import { allHotels } from '../test/catalog'
import { HomePage } from './HomePage'

// The globe needs a canvas, which jsdom does not have; the tests check the sections.
vi.mock('./Hero/Hero', () => ({ Hero: () => <h1>Отель без догадок</h1> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const selections = PERSONAS.map((persona) => ({
  persona,
  hotels: personaHotels(allHotels(), persona).map(tileHotel),
}))

// home-page, Requirement: Состав и порядок секций
describe('HomePage', () => {
  it('renders the sections in order: search, personas, vibe, stars, draw, banner', () => {
    const { container } = render(<HomePage newHotels={newHotels} selections={selections} />)
    const ids = Array.from(container.querySelectorAll('section[id]')).map((s) => s.id)
    expect(ids).toEqual(['search', 'personas', 'vibe', 'stars', 'draw', 'explore'])
  })

  // Scenario: Нет витрины маршрутов
  it('has no routes: no showcase, no links to them', () => {
    const { container } = render(<HomePage newHotels={newHotels} selections={selections} />)
    expect(document.getElementById('routes')).toBeNull()
    expect(container.querySelector('a[href^="/routes/"]')).toBeNull()
    expect(screen.queryByText(/маршрут/i)).toBeNull()
  })

  it('hides the personas without hotels', () => {
    const empty = PERSONAS.map((persona) => ({ persona, hotels: [] }))
    const { container } = render(<HomePage newHotels={newHotels} selections={empty} />)
    const ids = Array.from(container.querySelectorAll('section[id]')).map((s) => s.id)
    expect(ids).toEqual(['search', 'vibe', 'stars', 'draw', 'explore'])
  })

  it('has no manual form (Scenario: Нет ручной формы на главной)', () => {
    render(<HomePage newHotels={newHotels} selections={selections} />)
    expect(screen.queryByText('Вручную')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Направление' })).toBeNull()
  })
})

// home-page, Requirement: Подборки отелей по персонам
describe('HomePage personas', () => {
  it('starts with the first persona and switches to another one’s hotels', async () => {
    const user = userEvent.setup()
    render(<HomePage newHotels={newHotels} selections={selections} />)
    const section = document.getElementById('personas')!
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe('Подборки отелей для вас')
    const tabs = within(section).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Студент', 'Люкс', 'Воркейшн', 'Культура'])
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')

    // Scenario: Смена персоны
    await user.click(within(section).getByRole('tab', { name: 'Воркейшн' }))
    const list = within(within(section).getByRole('tabpanel')).getByRole('list', { name: 'Отели: Воркейшн' })
    const cards = within(list).getAllByRole('article')
    const workation = selections.find((s) => s.persona === 'workation')!.hotels
    expect(cards).toHaveLength(workation.length)

    // Scenario: Переход к отелю
    const links = cards.map((card) => within(card).getByRole('link').getAttribute('href'))
    expect(links).toEqual(workation.map((h) => `/hotels/${h.id}?adults=2&rooms=1`))
  })

  it('moves between the persona tabs with the arrows', async () => {
    const user = userEvent.setup()
    render(<HomePage newHotels={newHotels} selections={selections} />)
    const tabs = within(document.getElementById('personas')!).getAllByRole('tab')
    await user.click(tabs[0])
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(tabs[1])
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(tabs[3])
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(tabs[0])
  })
})
