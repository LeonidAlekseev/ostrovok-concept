import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newHotels } from '../../lib/catalogGenerator'
import { setScreen, WIDE } from '../../test/screen'
import { AssistantPage } from './AssistantPage'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

beforeEach(() => setScreen(WIDE))
afterEach(() => {
  push.mockClear()
  window.sessionStorage.clear()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/assistant')
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
    const log = () => screen.getByRole('log', { name: 'Диалог с Эвалом' })
    await within(log()).findByText('Хочу на море')

    view.unmount()
    render(<AssistantPage newHotels={newHotels} />)

    expect(await within(log()).findByText('Хочу на море')).toBeTruthy()
  })
})

// assistant-search, Requirement: Чат для долгих диалогов, Scenario: Длинный чат на компьютере
describe('AssistantPage layout', () => {
  it('takes the screen height from lg, and the columns scroll inside it', () => {
    const { container } = render(<AssistantPage newHotels={newHotels} />)
    const main = container.querySelector('main')
    expect(main?.className).toContain('lg:h-dvh')
    // A flex-1 page would take its height from the content (flex-basis 0%), not from the screen.
    expect(main?.className).toContain('lg:flex-none')
    const grid = container.querySelector('[data-assistant-app]')
    expect(grid?.className).toContain('lg:h-full')
    expect(grid?.className).toContain('min-h-0')
    expect(container.querySelector('section[aria-label="Чат с Эвалом"]')?.className).toContain('min-h-0')
  })
})

// search-modes, Requirement: Состояние поиска ассистента и выдачи, Scenario: Вариант ассистента
describe('AssistantPage plan', () => {
  it('opens /search with the option’s dates and guests', async () => {
    const user = userEvent.setup()
    render(<AssistantPage newHotels={newHotels} />)

    await user.type(screen.getByLabelText('Опишите поездку'), 'Хочу на море в октябре вдвоём, спокойно{Enter}')
    const actions = await screen.findByRole('group', { name: 'Что дальше' }, { timeout: 3000 })
    expect(screen.queryByText(/маршрут/i)).toBeNull()
    await user.click(within(actions).getByRole('button', { name: 'Фильтры' }))

    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls[0][0]).toMatch(
      /^\/search\?destination=[a-z-]+&checkin=[\d-]+&checkout=[\d-]+&adults=2&rooms=1$/,
    )
  }, 10_000)
})
