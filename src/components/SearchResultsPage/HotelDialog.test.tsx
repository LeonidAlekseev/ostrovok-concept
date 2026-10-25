import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getHotel } from '@/lib/catalogGenerator'
import { HotelDialog } from './HotelDialog'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/search',
  useRouter: () => ({ replace: vi.fn() }),
}))

const hotel = getHotel('prague-old-town-lantern')!
const stay = { checkIn: '2026-11-02', checkOut: '2026-11-04', guests: { adults: 2, children: 0, rooms: 1 } }

// hotel-page, Requirement: Плашка сгенерированного отеля
describe('HotelDialog generated', () => {
  it('marks a synthetic hotel in the window of the results (Scenario: Окно отеля на поиске)', () => {
    render(<HotelDialog hotel={hotel} stay={stay} onClose={() => {}} />)
    expect(within(screen.getByRole('dialog')).getByText('generated')).toBeDefined()
  })

  it('does not mark a real hotel', () => {
    render(<HotelDialog hotel={{ ...hotel, id: 'ota-9322089' }} stay={stay} onClose={() => {}} />)
    expect(within(screen.getByRole('dialog')).queryByText('generated')).toBeNull()
  })
})
