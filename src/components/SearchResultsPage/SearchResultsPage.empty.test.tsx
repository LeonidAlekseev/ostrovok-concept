import { fetched, open, results, cards, nameOf, PRAGUE } from './searchResultsTestKit'
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fullHotelsIn } from '../../lib/catalogGenerator'
import { destinations } from '../../data/destinations'

const hotels = destinations.flatMap((d) => fullHotelsIn(d.id)).slice(0, 40)
const ratingOf = (name: string) => hotels.find((h) => h.name === name)!.rating

// search-results-page, Requirement: Страница результатов, Scenario: Пустой поиск
describe('SearchResultsPage without a query', () => {
  it('lists the hotels of every destination by the guest rating under the blank form', async () => {
    fetched.hotels = hotels
    open('')
    await results()

    const form = screen.getByRole('form', { name: 'Поиск отелей' })
    expect(within(form).getByRole('combobox', { name: 'Направление' })).toHaveProperty('value', '')
    expect(screen.queryByText('Проверьте параметры поиска.')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Лучшие по оценкам гостей' })).toBeDefined()
    expect(screen.getByText(/^Найдено/)).toBeDefined()

    const ratings = cards().map((card) => ratingOf(nameOf(card)))
    expect(ratings.length).toBeGreaterThan(0)
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a))
  })

  it('shows the ordinary results for a filled search', async () => {
    open(PRAGUE)
    await results()

    expect(screen.getByRole('heading', { level: 1, name: 'Прага, Чехия' })).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Лучшие по оценкам гостей' })).toBeNull()
  })
})
