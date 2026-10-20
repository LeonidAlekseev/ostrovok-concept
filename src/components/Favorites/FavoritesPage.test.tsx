import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { addDays, todayIso } from '@/lib/dates'
import { favoritesStore } from '@/lib/storage'
import { FavoritesPage } from './FavoritesPage'

const HOTEL = 'prague-old-town-lantern'

afterEach(() => localStorage.clear())

// favorites
describe('FavoritesPage', () => {
  it('shows the empty state with a search link', () => {
    render(<FavoritesPage />)
    expect(screen.getByText('В избранном пока пусто')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Найти отель' }).getAttribute('href')).toBe('/')
  })

  it('lists a saved hotel with a link to it with the start dates, without signing in', () => {
    favoritesStore.set([HOTEL])
    render(<FavoritesPage />)
    const url = new URL(screen.getByRole('link', { name: /Lantern/i }).getAttribute('href')!, 'https://x')
    const checkIn = addDays(todayIso(), 1)
    expect(url.pathname).toBe(`/hotels/${HOTEL}`)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      checkin: checkIn,
      checkout: addDays(checkIn, 1),
      adults: '2',
      rooms: '1',
    })
  })

  it('removes a hotel and shows the empty state', async () => {
    const user = userEvent.setup()
    favoritesStore.set([HOTEL])
    render(<FavoritesPage />)
    await user.click(screen.getByRole('button', { name: 'Убрать из избранного' }))
    expect(favoritesStore.get()).toEqual([])
    expect(screen.getByText('В избранном пока пусто')).toBeTruthy()
  })
})
