import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import NotFound from './not-found'

// app-shell, Requirement: Страница 404
describe('NotFound', () => {
  it('links to the home page, the assistant and manual search (Scenario: Неизвестный адрес)', () => {
    render(<NotFound />)
    expect(screen.getByRole('heading', { name: 'Страница не найдена' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'На главную' }).getAttribute('href')).toBe('/')
    expect(screen.getByRole('link', { name: 'Спросить Эвал' }).getAttribute('href')).toBe('/assistant')
    expect(screen.getByRole('link', { name: 'Искать вручную' }).getAttribute('href')).toBe('/search')
    expect(screen.queryByRole('link', { name: 'Найти отель' })).toBeNull()
  })
})
