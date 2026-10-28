import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getHotel } from '../../lib/catalogGenerator'
import type { ResultItem } from '../../lib/results'
import type { Stay } from '../../lib/search'
import { ResultTile } from './ResultTile'

const hotel = getHotel('prague-old-town-lantern')!
const room = hotel.rooms[0]
const item: ResultItem = { hotel, room, rate: room.rates[0], price: room.rates[0].pricePerNight }
const stay = { checkIn: '2026-11-10', checkOut: '2026-11-12', guests: { adults: 2, children: 0, rooms: 1 } } as Stay

// hotelier-demo, Requirement: Сведения отельера в поиске
describe('a result with the hotelier’s characteristics', () => {
  it('says the hotelier told them, marked «демо» for the demonstration ones', () => {
    const { rerender } = render(
      <ResultTile
        item={item}
        stay={stay}
        active={false}
        onActivate={() => {}}
        hotelier={{ hotelId: hotel.id, facts: 3, demo: true }}
      />,
    )
    expect(screen.getByText(/Сведения отельера: 3/).textContent).toContain('демо')
    rerender(<ResultTile item={item} stay={stay} active={false} onActivate={() => {}} />)
    expect(screen.queryByText(/Сведения отельера/)).toBeNull()
  })
})
