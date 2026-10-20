import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

  it('closes a panel on a press on the logo', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    await user.click(screen.getByRole('link', { name: 'Островок! — на главную' }))
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

  it('shows an account icon to a guest, linked to /login, without text', () => {
    setup()
    const login = screen.getByRole('link', { name: 'Войти' })
    expect(login.getAttribute('href')).toBe('/login')
    expect(login.textContent).toBe('')
  })

  it('keeps the account icon between the notifications and the menu', () => {
    setup()
    const actions = [...screen.getByRole('banner').querySelectorAll('[aria-label]')].map((el) =>
      el.getAttribute('aria-label'),
    )
    expect(actions).toEqual(['Островок! — на главную', 'Избранное', 'Уведомления', 'Войти', 'Открыть меню'])
  })

  it('shows the account icon, not the name, once signed in, and "Выйти" ends the session only', async () => {
    favoritesStore.set(['h1'])
    signIn('anna@example.com')
    const user = setup()
    expect(screen.queryByRole('link', { name: 'Войти' })).toBeNull()
    const account = screen.getByRole('button', { name: 'Аккаунт: anna' })
    expect(account.textContent).toBe('')

    await user.click(account)
    const dialog = screen.getByRole('dialog', { name: 'Аккаунт' })
    expect(within(dialog).getByText('anna')).toBeTruthy()
    expect(dialog.textContent).toContain('anna@example.com')
    const nav = screen.getByRole('navigation', { name: 'Аккаунт' })
    expect([...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Мои поездки', '/trips'],
    ])

    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(sessionStore.get()).toBeNull()
    expect(favoritesStore.get()).toEqual(['h1'])
    expect(await screen.findByRole('link', { name: 'Войти' })).toBeTruthy()
  })
})

describe('Header on scroll', () => {
  const scrollTo = (y: number) => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
  }
  const state = () => screen.getByRole('banner').getAttribute('data-sticky')
  const frame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  const stateAfter = (expected: string) => waitFor(() => expect(state()).toBe(expected))

  afterEach(() => scrollTo(0))

  it('scrolls with the page at the top, hides when fixed, shows on a scroll up far from the top', async () => {
    setup()
    expect(state()).toBe('docked')
    scrollTo(2000)
    await stateAfter('hidden')
    scrollTo(1900)
    await stateAfter('shown')
    scrollTo(2000)
    await stateAfter('hidden')
  })

  it('does not show on a scroll up closer than half a screen', async () => {
    setup()
    scrollTo(300)
    await stateAfter('hidden')
    scrollTo(200)
    await frame()
    expect(state()).toBe('hidden')
  })

  it('stays shown while the menu is open and while focus is inside', async () => {
    const user = setup()
    scrollTo(2000)
    await frame()
    scrollTo(1900)
    await stateAfter('shown')
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    scrollTo(2100)
    await frame()
    expect(state()).toBe('shown')
    await user.keyboard('{Escape}')
    screen.getByRole('link', { name: 'Избранное' }).focus()
    scrollTo(2200)
    await frame()
    expect(state()).toBe('shown')
    ;(document.activeElement as HTMLElement).blur()
    await stateAfter('hidden')
  })

  it('publishes the offset of the shown header for the sticky blocks', async () => {
    setup()
    scrollTo(2000)
    await frame()
    scrollTo(1900)
    await stateAfter('shown')
    expect(document.documentElement.style.getPropertyValue('--sticky-header-offset')).toBe('var(--header-height)')
  })
})
