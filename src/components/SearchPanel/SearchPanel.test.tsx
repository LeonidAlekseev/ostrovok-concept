import { useRef, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useHotelSearch } from '../../hooks/useHotelSearch'
import { SearchPanel, type SearchMode } from './SearchPanel'

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
