import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signIn } from '@/lib/auth'
import { favoritesStore, sessionStore } from '@/lib/storage'
import { Header } from './Header'

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>()
  return {
    ...actual,
    usePathname: () => window.location.pathname,
  }
})

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

  it('widens the header to the search page width from 3xl only on /search', () => {
    const logo = () => screen.getByRole('link', { name: 'Островок! — на главную' }).parentElement!.className
    window.history.pushState({}, '', '/search')
    setup()
    expect(logo()).toMatch(/(^|\s)3xl:max-w-\(--page-max-wide\)(\s|$)/)
    expect(logo()).toMatch(/(^|\s)3xl:px-\(--page-x\)(\s|$)/)
    window.history.pushState({}, '', '/')
  })

  it('keeps the header width on other pages', () => {
    setup()
    expect(screen.getByRole('link', { name: 'Островок! — на главную' }).parentElement!.className).not.toMatch(
      /3xl:max-w-/,
    )
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
    const items = [...nav.querySelectorAll('a, button')].map((el) => [el.textContent, el.getAttribute('href')])
    expect(items).toEqual([
      ['Поиск отелей', '/#search'],
      ['Мои поездки', '/trips'],
      ['Избранное', '/favorites'],
      ['Уведомления', null],
      ['Войти', '/login'],
      ['Поддержка', '/help'],
    ])
    await user.click(screen.getByRole('link', { name: 'Мои поездки' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Меню' })).toBeNull())
  })

  it('opens the notifications from the menu and closes the menu', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    await user.click(
      within(screen.getByRole('navigation', { name: 'Основное меню' })).getByRole('button', { name: 'Уведомления' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Меню' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Уведомления' })).toBeTruthy()
  })

  it('opens the account menu from the menu once signed in', async () => {
    signIn('anna@example.com')
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    const nav = screen.getByRole('navigation', { name: 'Основное меню' })
    expect(within(nav).queryByRole('link', { name: 'Войти' })).toBeNull()
    await user.click(within(nav).getByRole('button', { name: 'Аккаунт' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Меню' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Аккаунт' })).toBeTruthy()
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

describe('Header chrome', () => {
  // site-header, Requirement: Оформление шапки
  it('on the hotel page is transparent with a white logo and icons', () => {
    window.history.pushState({}, '', '/hotels/prague-old-town-lantern')
    setup()
    const header = screen.getByRole('banner')
    expect(header.className).not.toMatch(/\bbg-background\b/)
    expect(screen.getByRole('link', { name: 'Островок! — на главную' }).className).toMatch(/\btext-white\b/)
    expect(screen.getByRole('link', { name: 'Избранное' }).className).toMatch(/(^|\s)text-white(\s|$)/)
    window.history.pushState({}, '', '/')
  })

  it('is flat and blue on the rates page of a hotel, never sticky', () => {
    window.history.pushState({}, '', '/hotels/prague-old-town-lantern/rooms')
    setup()
    const header = screen.getByRole('banner')
    expect(header.className).toMatch(/\bbg-background\b/)
    expect(header.className).not.toMatch(/rounded|shadow|fixed|sticky/)
    expect(screen.getByRole('link', { name: 'Островок! — на главную' }).className).toMatch(/\btext-primary\b/)
    window.history.pushState({}, '', '/')
  })

  it('scrolls with the page', () => {
    setup()
    expect(screen.getByRole('banner').className).toMatch(/\babsolute\b/)
    expect(screen.getByRole('banner').className).not.toMatch(/\b(fixed|sticky)\b/)
  })
})
