import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { favoritesStore } from '../../lib/storage'
import { FavoriteButton } from './FavoriteButton'

const HOTEL = 'prague-old-town-lantern'

afterEach(() => localStorage.clear())

describe('FavoriteButton', () => {
  it('adds the hotel on the first press and removes it on the second', async () => {
    const user = userEvent.setup()
    render(<FavoriteButton hotelId={HOTEL} />)
    const button = screen.getByRole('button', { name: 'Добавить в избранное' })
    expect(button.getAttribute('aria-pressed')).toBe('false')

    await user.click(button)
    expect(favoritesStore.get()).toEqual([HOTEL])
    expect(screen.getByRole('button', { name: 'Убрать из избранного' }).getAttribute('aria-pressed')).toBe('true')

    await user.click(button)
    expect(favoritesStore.get()).toEqual([])
    expect(screen.getByRole('button', { name: 'Добавить в избранное' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('renders "not saved" before hydration even if the hotel is saved', () => {
    favoritesStore.set([HOTEL])
    const html = renderToString(<FavoriteButton hotelId={HOTEL} />)
    expect(html).toContain('aria-label="Добавить в избранное"')
    expect(html).toContain('aria-pressed="false"')
  })

  it('follows a change made in another tab', () => {
    render(<FavoriteButton hotelId={HOTEL} />)
    act(() => {
      localStorage.setItem(favoritesStore.key, JSON.stringify([HOTEL]))
      window.dispatchEvent(new StorageEvent('storage', { key: favoritesStore.key }))
    })
    expect(screen.getByRole('button', { name: 'Убрать из избранного' })).toBeTruthy()
  })
})
