import { useRef, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHotelSearch } from '../../hooks/useHotelSearch'
import { SearchPanel, type SearchMode } from './SearchPanel'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

afterEach(() => push.mockClear())

function Harness() {
  const [mode, setMode] = useState<SearchMode>('assistant')
  const search = useHotelSearch()
  const destinationRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  return (
    <SearchPanel
      mode={mode}
      onModeChange={setMode}
      search={search}
      destinationRef={destinationRef}
      submitRef={submitRef}
      onPreview={() => {}}
      onChoose={search.searchFor}
    />
  )
}

// search-modes, Requirement: Сохранение состояния режимов
describe('SearchPanel tabs', () => {
  it('keeps typed text in every panel when switching tabs', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const wish = screen.getByLabelText('Опишите поездку')
    await user.type(wish, 'Хочу на море')

    await user.click(screen.getByRole('tab', { name: 'Вручную' }))
    const destination = screen.getByRole('combobox', { name: 'Направление' })
    await user.type(destination, 'Сочи')
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('tab', { name: 'Случайность' }))
    await user.click(screen.getByRole('tab', { name: 'Ассистент' }))

    // Same nodes: the panels were hidden, not unmounted and mounted again.
    expect(screen.getByLabelText('Опишите поездку')).toBe(wish)
    expect((wish as HTMLTextAreaElement).value).toBe('Хочу на море')

    await user.click(screen.getByRole('tab', { name: 'Вручную' }))
    expect(screen.getByRole('combobox', { name: 'Направление' })).toBe(destination)
    expect((destination as HTMLInputElement).value).toBe('Сочи')
  })
})

// manual-search, Requirement: Демо-поиск и результаты
describe('SearchPanel manual search', () => {
  it('opens the results page of the chosen city', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('tab', { name: 'Вручную' }))
    await user.type(screen.getByRole('combobox', { name: 'Направление' }), 'Прага')
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: /Найти отель/ }))

    expect(push).toHaveBeenCalledWith(
      expect.stringMatching(/^\/search\?destination=prague&checkin=[\d-]+&checkout=[\d-]+&adults=2&rooms=1$/),
    )
    // The results block under the form is gone: results live on /search.
    expect(screen.queryByText('Ищем варианты…')).toBeNull()
  })
})

// assistant-search, Requirement: План поездки, Scenario: Выбор варианта
describe('SearchPanel assistant plan', () => {
  it('opens the results page of the option with its dates and guests', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Опишите поездку'), 'Хочу на море в октябре вдвоём, спокойно{Enter}')
    const [option] = await screen.findAllByRole('button', { name: /₽/ }, { timeout: 3000 })
    await user.click(option)

    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls[0][0]).toMatch(
      /^\/search\?destination=[a-z-]+&checkin=[\d-]+&checkout=[\d-]+&adults=2&rooms=1$/,
    )
  }, 10_000)
})
