import { useRef, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DestinationField } from './DestinationField'

function Harness({ onParentKeyDown }: { onParentKeyDown?: (key: string) => void }) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div onKeyDown={(event) => onParentKeyDown?.(event.key)}>
      <DestinationField value={value} inputRef={inputRef} onChange={setValue} />
      <button type="button">Снаружи</button>
    </div>
  )
}

async function openList() {
  const user = userEvent.setup()
  const input = screen.getByRole('combobox', { name: 'Направление' })
  await user.type(input, 'Со')
  expect(await screen.findByRole('listbox', { name: 'Подходящие направления' })).toBeTruthy()
  return { user, input }
}

describe('DestinationField', () => {
  // manual-search, Scenario: Escape
  it('closes only the list on Escape and keeps the event from the parent', async () => {
    const onParentKeyDown = vi.fn()
    render(<Harness onParentKeyDown={onParentKeyDown} />)
    const { user, input } = await openList()
    // The parent does hear other keys, so silence on Escape means the field stopped it.
    expect(onParentKeyDown).toHaveBeenCalledWith('С')
    onParentKeyDown.mockClear()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onParentKeyDown).not.toHaveBeenCalledWith('Escape')
    expect((input as HTMLInputElement).value).toBe('Со')
  })

  // manual-search, Requirement: Общее поведение всплывающих слоёв
  it('closes the list on a press outside the field', async () => {
    render(<Harness />)
    const { user } = await openList()

    await user.click(screen.getByText('Снаружи'))

    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
