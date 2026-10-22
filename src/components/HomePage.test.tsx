import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { newHotels } from '../lib/catalogGenerator'
import { routeCards } from '../test/catalog'
import { HomePage } from './HomePage'

// The globe needs a canvas, which jsdom does not have; the tests check the sections.
vi.mock('./Hero/Hero', () => ({ Hero: () => <h1>Найди свой уголок</h1> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

// home-page, Requirement: Состав и порядок секций
describe('HomePage', () => {
  it('renders the sections in order: search, personas, routes, vibe, stars, draw, banner', () => {
    const { container } = render(<HomePage newHotels={newHotels} routes={routeCards()} />)
    const ids = Array.from(container.querySelectorAll('section[id]')).map((s) => s.id)
    expect(ids).toEqual(['search', 'personas', 'routes', 'vibe', 'stars', 'draw', 'explore'])
  })

  it('hides the personas and the routes without routes', () => {
    const { container } = render(<HomePage newHotels={newHotels} routes={[]} />)
    const ids = Array.from(container.querySelectorAll('section[id]')).map((s) => s.id)
    expect(ids).toEqual(['search', 'vibe', 'stars', 'draw', 'explore'])
  })
})

// home-page, Requirement: Витрина маршрутов, Scenario: Все маршруты
describe('HomePage routes', () => {
  it('shows every route, the featured first', () => {
    const routes = routeCards()
    const featured = { ...routes[5], featured: true }
    render(<HomePage newHotels={newHotels} routes={[featured, ...routes.filter((r) => r.id !== featured.id)]} />)
    const links = within(document.getElementById('routes')!).getAllByRole('link')
    expect(links).toHaveLength(12)
    expect(links[0].getAttribute('href')).toBe(`/routes/${featured.id}`)
  })
})

// home-page, Requirement: Карусель персон
describe('HomePage personas', () => {
  it('starts with the first persona and its first city, and switches personas and cities', async () => {
    const user = userEvent.setup()
    render(<HomePage newHotels={newHotels} routes={routeCards()} />)
    const section = document.getElementById('personas')!
    const tabs = within(section).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Студент', 'Люкс', 'Воркейшн', 'Культура'])
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')

    // Scenario: Смена персоны
    await user.click(within(section).getByRole('tab', { name: 'Воркейшн' }))
    const panel = within(section).getByRole('tabpanel')
    const cities = within(panel).getByRole('list', { name: 'Города маршрутов' })
    expect(
      within(cities)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Лиссабон', 'Алматы', 'Барселона'])
    const cards = within(within(panel).getByRole('list', { name: 'Маршруты: Воркейшн' })).getAllByRole('link')
    expect(cards.map((card) => card.getAttribute('href'))).toEqual([
      '/routes/lisbon-workation',
      '/routes/almaty-workation',
      '/routes/barcelona-workation',
    ])
    expect(cards[0].hasAttribute('data-selected')).toBe(true)

    // Scenario: Смена города
    await user.click(within(cities).getByRole('button', { name: 'Барселона' }))
    expect(within(cities).getByRole('button', { name: 'Барселона' }).getAttribute('aria-pressed')).toBe('true')
    expect(cards.map((card) => card.hasAttribute('data-selected'))).toEqual([false, false, true])
    expect(cards[2].textContent).toContain('≈')
  })

  it('moves between the persona tabs with the arrows', async () => {
    const user = userEvent.setup()
    render(<HomePage newHotels={newHotels} routes={routeCards()} />)
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

  it('has no manual form (Scenario: Нет ручной формы на главной)', () => {
    render(<HomePage newHotels={newHotels} routes={routeCards()} />)
    expect(screen.queryByText('Вручную')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Направление' })).toBeNull()
  })
})
