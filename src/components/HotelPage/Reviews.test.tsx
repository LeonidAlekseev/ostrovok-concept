import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Review } from '@/lib/catalog'
import { ReviewsDialog } from './Reviews'

const reviews: Review[] = Array.from({ length: 12 }, (_, i) => ({
  id: `r${i}`,
  author: `Автор ${i}`,
  date: '2026-09-01',
  score: 8,
  text: `Текст ${i}`,
}))

// hotel-page, Requirement: Отзывы
describe('ReviewsDialog', () => {
  it('shows the summary and 5 reviews, then 5 more, then the rest without the button', async () => {
    const user = userEvent.setup()
    render(<ReviewsDialog rating={8.4} reviewCount={120} reviews={reviews} />)
    expect(screen.queryByText(/^Автор/)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Читать отзывы (120)' }))
    const dialog = screen.getByRole('dialog', { name: 'Отзывы' })
    for (const text of ['8,4', 'Отлично', '120 отзывов']) expect(within(dialog).getByText(text)).toBeDefined()
    expect(within(dialog).getAllByText(/^Автор/)).toHaveLength(5)
    await user.click(within(dialog).getByRole('button', { name: 'Показать ещё' }))
    expect(within(dialog).getAllByText(/^Автор/)).toHaveLength(10)
    await user.click(within(dialog).getByRole('button', { name: 'Показать ещё' }))
    expect(within(dialog).getAllByText(/^Автор/)).toHaveLength(12)
    expect(within(dialog).queryByRole('button', { name: 'Показать ещё' })).toBeNull()
  })

  it('closes with Escape and "Закрыть", returning focus to the button, and starts again from 5', async () => {
    const user = userEvent.setup()
    render(<ReviewsDialog rating={9.1} reviewCount={1323} reviews={reviews} />)
    const button = screen.getByRole('button', { name: /^Читать отзывы \(1\s323\)$/ })

    await user.click(button)
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(button)

    await user.click(button)
    expect(within(screen.getByRole('dialog')).getAllByText(/^Автор/)).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(button)
  })
})
