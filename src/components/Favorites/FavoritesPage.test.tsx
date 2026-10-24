import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays, todayIso } from '@/lib/dates'
import { favoritesStore } from '@/lib/storage'
import { setProduction } from '@/test/env'
import { FavoritesPage } from './FavoritesPage'
import { waitForCatalog } from '@/test/waitForCatalog'

const HOTEL = 'prague-old-town-lantern'

afterEach(() => localStorage.clear())

// favorites
describe('FavoritesPage', () => {
  it('shows the empty state with a search link', async () => {
    render(<FavoritesPage />)
    await waitForCatalog()
    expect(screen.getByText('В избранном пока пусто')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Найти отель' }).getAttribute('href')).toBe('/')
  })

  it('lists a saved hotel with a link to it with the start dates, without signing in', async () => {
    favoritesStore.set([HOTEL])
    render(<FavoritesPage />)
    await waitForCatalog()
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

  // hotel-catalog, Requirement: Чтение каталога из Supabase
  it('loads the saved hotels by id in one request (Scenario: Избранное)', async () => {
    favoritesStore.set([HOTEL, 'prague-vltava-loft-rooms'])
    render(<FavoritesPage />)
    await waitForCatalog()
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(vi.mocked(fetch)).toHaveBeenCalledExactlyOnceWith(`/api/hotels?ids=${HOTEL},prague-vltava-loft-rooms`)
  })

  it('says the hotels failed to load', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }))
    favoritesStore.set([HOTEL])
    render(<FavoritesPage />)
    expect((await screen.findByRole('alert')).textContent).toBe('Не удалось загрузить отели. Обновите страницу.')
  })

  it('removes a hotel and shows the empty state', async () => {
    const user = userEvent.setup()
    favoritesStore.set([HOTEL])
    render(<FavoritesPage />)
    await waitForCatalog()
    await user.click(screen.getByRole('button', { name: 'Убрать из избранного' }))
    expect(favoritesStore.get()).toEqual([])
    expect(screen.getByText('В избранном пока пусто')).toBeTruthy()
  })
})

// hotel-catalog, Requirement: Синтетические отели только вне production
describe('FavoritesPage in production', () => {
  it('shows the empty state for a saved synthetic hotel, without an error', async () => {
    setProduction(true)
    favoritesStore.set([HOTEL])
    render(<FavoritesPage />)
    await waitForCatalog()
    expect(screen.getByText('В избранном пока пусто')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
