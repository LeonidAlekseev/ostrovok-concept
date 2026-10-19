import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { signIn } from '@/lib/auth'
import { favoritesStore, sessionStore } from '@/lib/storage'
import { Header } from './Header'

beforeEach(() => window.localStorage.clear())

const setup = () => {
  const user = userEvent.setup()
  render(
    <>
      <Header />
      <p>Снаружи</p>
    </>,
  )
  return user
}

describe('Header', () => {
  it('links the logo to the home page', () => {
    setup()
    expect(screen.getByRole('link', { name: 'Островок! — на главную' }).getAttribute('href')).toBe('/')
  })

  it('links "Избранное" to /favorites instead of opening a panel', () => {
    setup()
    const favorites = screen.getByRole('link', { name: 'Избранное' })
    expect(favorites.getAttribute('href')).toBe('/favorites')
    expect(screen.queryByRole('button', { name: 'Избранное' })).toBeNull()
  })

  it('switches between the notifications and the menu, one at a time', async () => {
    const user = setup()
    const notifications = screen.getByRole('button', { name: 'Уведомления' })
    await user.click(notifications)
    const panel = screen.getByRole('dialog', { name: 'Уведомления' })
    expect(notifications.getAttribute('aria-expanded')).toBe('true')
    expect(notifications.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.textContent).toContain('Новых уведомлений нет')

    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Уведомления' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Меню' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Закрыть меню' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('closes a panel on a second press, "Понятно" and Escape', async () => {
    const user = setup()
    const notifications = screen.getByRole('button', { name: 'Уведомления' })
    await user.click(notifications)
    await user.click(notifications)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(notifications)
    await user.click(screen.getByRole('button', { name: 'Понятно' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(notifications)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes a panel on a press outside the actions', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    await user.click(screen.getByText('Снаружи'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('lists the sections in the menu and closes it on a choice', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    const nav = screen.getByRole('navigation', { name: 'Основное меню' })
    const links = [...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([
      ['Поиск отелей', '/#search'],
      ['Мои поездки', '/trips'],
      ['Избранное', '/favorites'],
      ['Поддержка', '/help'],
    ])
    await user.click(screen.getByRole('link', { name: 'Мои поездки' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Меню' })).toBeNull())
  })

  it('shows "Войти" to a guest, linked to /login', () => {
    setup()
    expect(screen.getByRole('link', { name: 'Войти' }).getAttribute('href')).toBe('/login')
  })

  it('shows the name and the account menu once signed in, and "Выйти" ends the session only', async () => {
    favoritesStore.set(['h1'])
    signIn('anna@example.com')
    const user = setup()
    expect(screen.queryByRole('link', { name: 'Войти' })).toBeNull()

    await user.click(screen.getByRole('button', { name: /anna/ }))
    const nav = screen.getByRole('navigation', { name: 'Аккаунт' })
    expect([...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Мои поездки', '/trips'],
      ['Избранное', '/favorites'],
    ])

    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(sessionStore.get()).toBeNull()
    expect(favoritesStore.get()).toEqual(['h1'])
    expect(await screen.findByRole('link', { name: 'Войти' })).toBeTruthy()
  })
})
