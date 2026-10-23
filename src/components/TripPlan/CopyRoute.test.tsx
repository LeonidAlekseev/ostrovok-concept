import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { copyRouteToTrip } from '@/app/trip/actions'
import { CopyRoute } from './CopyRoute'

vi.mock('@/app/trip/actions', () => ({ copyRouteToTrip: vi.fn() }))

// trip-plan, Requirement: Копия маршрута
describe('CopyRoute', () => {
  it('copies the route once on opening, and again on «Попробовать ещё раз» after an error', async () => {
    vi.mocked(copyRouteToTrip).mockResolvedValue({ error: 'Маршрут не найден' })
    const user = userEvent.setup()
    render(
      <StrictMode>
        <CopyRoute routeId="prague-culture" />
      </StrictMode>,
    )
    expect((await screen.findByRole('alert')).textContent).toBe('Маршрут не найден')
    expect(copyRouteToTrip).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'К маршруту' }).getAttribute('href')).toBe('/routes/prague-culture')
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }))
    expect(copyRouteToTrip).toHaveBeenCalledTimes(2)
  })
})
