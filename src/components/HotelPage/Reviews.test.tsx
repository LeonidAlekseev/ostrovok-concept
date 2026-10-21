import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Review } from '@/lib/catalog'
import { Reviews } from './Reviews'

const reviews: Review[] = Array.from({ length: 12 }, (_, i) => ({
  id: `r${i}`,
  author: `Автор ${i}`,
  date: '2026-09-01',
  score: 8,
  text: `Текст ${i}`,
}))

// hotel-page, Requirement: Отзывы
describe('Reviews', () => {
  it('shows 5, then 5 more, then the rest without the button', async () => {
    const user = userEvent.setup()
    render(<Reviews rating={8.4} reviewCount={120} reviews={reviews} />)
    expect(screen.getByText('120 отзывов')).toBeTruthy()
    expect(screen.getAllByText(/^Автор/)).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }))
    expect(screen.getAllByText(/^Автор/)).toHaveLength(10)
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }))
    expect(screen.getAllByText(/^Автор/)).toHaveLength(12)
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull()
  })

  it('shows the rating with a decimal comma', () => {
    render(<Reviews rating={9.1} reviewCount={120} reviews={reviews} />)
    expect(screen.getByText('9,1')).toBeTruthy()
  })
})
