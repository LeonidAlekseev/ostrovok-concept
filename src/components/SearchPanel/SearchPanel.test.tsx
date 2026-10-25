import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SearchPanel } from './SearchPanel'

// home-page, Requirement: Панель входа в поиск
describe('SearchPanel', () => {
  it('links "Спросить Эвал" to /assistant (Scenario: Переход к Эвал)', () => {
    render(<SearchPanel />)
    expect(screen.getByRole('link', { name: 'Спросить Эвал' }).getAttribute('href')).toBe('/assistant')
  })

  it('links "Искать вручную" to /search without a query (Scenario: Переход к ручному поиску)', () => {
    render(<SearchPanel />)
    expect(screen.getByRole('link', { name: 'Искать вручную' }).getAttribute('href')).toBe('/search')
  })

  it('has no chat and no manual fields, and its figures are decorative', () => {
    const { container } = render(<SearchPanel />)
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    const figures = [...container.querySelectorAll('img')]
    expect(figures.map((img) => img.getAttribute('alt'))).toEqual(['', ''])
  })
})
