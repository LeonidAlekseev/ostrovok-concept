import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
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

  it('lists a saved hotel with a link to it, without signing in', () => {
    favoritesStore.set([HOTEL])
    render(<FavoritesPage />)
    expect(screen.getByRole('link', { name: /Lantern/i }).getAttribute('href')).toBe(`/hotels/${HOTEL}`)
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
