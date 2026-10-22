import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHotelSearch } from '../../hooks/useHotelSearch'
import { newHotels } from '../../lib/catalogGenerator'
import { routeCards } from '../../test/catalog'
import { SearchPanel } from './SearchPanel'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

afterEach(() => push.mockClear())

function Harness({ routes = routeCards() }) {
  const search = useHotelSearch()
  return <SearchPanel onChoose={search.searchFor} newHotels={newHotels} routes={routes} />
}

// home-page, Requirement: Состав и порядок секций, Scenario: Нет ручной формы на главной
describe('SearchPanel', () => {
  it('is the assistant alone: no tabs and no manual fields', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Опишите поездку')).toBeTruthy()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByText('Вручную')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Направление' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Найти отель/ })).toBeNull()
  })
})

// assistant-search, Requirement: План поездки, Scenario: Выбор варианта; Готовый маршрут в плане
describe('SearchPanel assistant plan', () => {
  it('shows the ready-made route over the options and opens /search with the option’s dates and guests', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Опишите поездку'), 'Хочу на море в октябре вдвоём, спокойно{Enter}')
    const [option] = await screen.findAllByRole('button', { name: /₽/ }, { timeout: 3000 })
    const ready = screen.getByRole('region', { name: 'Готовый маршрут' })
    expect(within(ready).getByRole('link').getAttribute('href')).toMatch(/^\/routes\/[a-z0-9-]+$/)
    // Over the options.
    expect(ready.compareDocumentPosition(option) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(option)

    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls[0][0]).toMatch(
      /^\/search\?destination=[a-z-]+&checkin=[\d-]+&checkout=[\d-]+&adults=2&rooms=1$/,
    )
  }, 10_000)

  it('shows no ready-made route without routes', async () => {
    const user = userEvent.setup()
    render(<Harness routes={[]} />)
    await user.type(screen.getByLabelText('Опишите поездку'), 'Хочу на море в октябре вдвоём, спокойно{Enter}')
    await screen.findAllByRole('button', { name: /₽/ }, { timeout: 3000 })
    expect(screen.queryByRole('region', { name: 'Готовый маршрут' })).toBeNull()
  }, 10_000)
})
