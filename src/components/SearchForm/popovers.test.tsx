import { useState, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { addDays, todayIso } from '../../lib/dates'
import type { Guests } from '../../lib/search'
import { DateField } from './DateField'
import { GuestsField } from './GuestsField'

function Dates() {
  const checkIn = addDays(todayIso(), 1)
  const [dates, setDates] = useState({ checkIn, checkOut: addDays(checkIn, 1) })
  return (
    <DateField
      checkIn={dates.checkIn}
      checkOut={dates.checkOut}
      onChange={(next, out) => setDates({ checkIn: next, checkOut: out })}
    />
  )
}

function GuestsHarness() {
  const [guests, setGuests] = useState<Guests>({ adults: 2, children: 0, rooms: 1 })
  return <GuestsField value={guests} onChange={setGuests} />
}

// manual-search, Requirement: Общее поведение всплывающих слоёв
const fields: { name: string; field: ReactNode; trigger: RegExp; dialog: string }[] = [
  { name: 'DateField', field: <Dates />, trigger: /^Даты поездки/, dialog: 'Выбор дат заезда и выезда' },
  { name: 'GuestsField', field: <GuestsHarness />, trigger: /^Гости/, dialog: 'Гости и номера' },
]

describe.each(fields)('$name popover', ({ field, trigger, dialog }) => {
  async function open() {
    const user = userEvent.setup()
    render(
      <>
        {field}
        <p>Снаружи</p>
      </>,
    )
    await user.click(screen.getByRole('button', { name: trigger }))
    expect(await screen.findByRole('dialog', { name: dialog })).toBeTruthy()
    return user
  }

  it('closes on Escape', async () => {
    const user = await open()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: dialog })).toBeNull()
  })

  it('closes on a press outside the field', async () => {
    const user = await open()
    await user.click(screen.getByText('Снаружи'))
    expect(screen.queryByRole('dialog', { name: dialog })).toBeNull()
  })
})

// star-search, Requirement: Анкета
describe('single DateField', () => {
  const single = (
    <>
      <DateField single checkIn="2026-10-21" checkOut="2026-10-21" describedBy="note" onChange={() => {}} />
      <p id="note">Выезд — через 2 ночи</p>
    </>
  )

  it('shows one month and is described by the note', async () => {
    const user = userEvent.setup()
    render(single)
    const trigger = screen.getByRole('button', { name: /^Дата заезда/ })
    expect(trigger.getAttribute('aria-describedby')).toBe('note')
    await user.click(trigger)
    await screen.findByRole('dialog', { name: 'Выбор даты заезда' })
    expect(screen.getAllByRole('group')).toHaveLength(1)
  })

  it('keeps two months for a stay', async () => {
    const user = userEvent.setup()
    render(<Dates />)
    await user.click(screen.getByRole('button', { name: /^Даты поездки/ }))
    await screen.findByRole('dialog', { name: 'Выбор дат заезда и выезда' })
    expect(screen.getAllByRole('group')).toHaveLength(2)
  })
})
