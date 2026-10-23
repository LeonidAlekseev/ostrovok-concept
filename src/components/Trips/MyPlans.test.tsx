import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { deleteTripPlan } from '@/app/trip/actions'
import { formatPrice } from '@/lib/format'
import type { TripSummary } from '@/lib/trip'
import { MyPlans } from './MyPlans'

vi.mock('@/app/trip/actions', () => ({ deleteTripPlan: vi.fn(async () => ({})) }))

const plan = (id: string, title: string): TripSummary => ({
  id,
  title,
  city: 'Прага',
  start: '2026-11-03',
  end: '2026-11-08',
  nights: 5,
  main: 96500,
  extras: 7700,
})

// trips, Requirement: Мои планы
describe('MyPlans', () => {
  it('shows a card per plan with the city, dates and price (Scenario: Список планов)', () => {
    render(<MyPlans plans={[plan('a', 'Культурный отпуск в Праге'), plan('b', 'Прага для студента')]} />)
    const cards = screen.getAllByTestId('plan-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].textContent).toContain('Прага · ')
    expect(cards[0].textContent).toContain('5 ночей')
    expect(cards[0].textContent).toContain(formatPrice(96500))
    expect(within(cards[1]).getByRole('link', { name: 'Открыть' }).getAttribute('href')).toBe('/trip/b')
  })

  it('deletes a plan after a question', async () => {
    const user = userEvent.setup()
    render(<MyPlans plans={[plan('a', 'Культурный отпуск в Праге')]} />)
    await user.click(screen.getByRole('button', { name: 'Удалить план «Культурный отпуск в Праге»' }))
    expect(deleteTripPlan).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'Удалить план' }))
    expect(deleteTripPlan).toHaveBeenCalledWith('a')
  })

  it('says when there are no plans or they did not load', () => {
    const { rerender } = render(<MyPlans plans={[]} />)
    expect(screen.getByText(/Планов пока нет/)).toBeTruthy()
    rerender(<MyPlans plans={null} />)
    expect(screen.getByRole('alert').textContent).toContain('Не удалось загрузить планы')
  })
})
