import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newHotels } from '../../lib/catalogGenerator'
import { AssistantPage } from './AssistantPage'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

afterEach(() => {
  push.mockClear()
  window.sessionStorage.clear()
})

// search-modes, Requirement: Страница Эвал
describe('AssistantPage', () => {
  it('shows Eval’s chat with its input (Scenario: Открытие страницы)', () => {
    render(<AssistantPage newHotels={newHotels} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Спросить Эвал' })).toBeTruthy()
    expect(screen.getByLabelText('Опишите поездку')).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Направление' })).toBeNull()
  })

  it('keeps the dialog after a reload (Scenario: Перезагрузка)', async () => {
    const user = userEvent.setup()
    const view = render(<AssistantPage newHotels={newHotels} />)
    await user.type(screen.getByLabelText('Опишите поездку'), 'Хочу на море{Enter}')
    await screen.findByText('Хочу на море')

    view.unmount()
    render(<AssistantPage newHotels={newHotels} />)

    expect(await screen.findByText('Хочу на море')).toBeTruthy()
  })
})

// search-modes, Requirement: Состояние поиска ассистента и выдачи, Scenario: Вариант ассистента
describe('AssistantPage plan', () => {
  it('opens /search with the option’s dates and guests', async () => {
    const user = userEvent.setup()
    render(<AssistantPage newHotels={newHotels} />)

    await user.type(screen.getByLabelText('Опишите поездку'), 'Хочу на море в октябре вдвоём, спокойно{Enter}')
    const [option] = await screen.findAllByRole('button', { name: /₽/ }, { timeout: 3000 })
    expect(screen.queryByText(/маршрут/i)).toBeNull()
    await user.click(option)

    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls[0][0]).toMatch(
      /^\/search\?destination=[a-z-]+&checkin=[\d-]+&checkout=[\d-]+&adults=2&rooms=1$/,
    )
  }, 10_000)
})
