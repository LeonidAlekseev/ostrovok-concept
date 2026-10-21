import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

// jsdom has no `:focus-visible`: pretend the focused header element got focus from the keyboard.
const focusVisible = () => {
  const matches = Element.prototype.matches
  return vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
    return selector === ':focus-visible' ? this === document.activeElement : matches.call(this, selector)
  })
}

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

  afterEach(() => {
    vi.restoreAllMocks()
    scrollTo(0)
  })

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

  const showFar = async () => {
    scrollTo(2000)
    await frame()
    scrollTo(1900)
    await stateAfter('shown')
  }

  it('stays shown while the menu is open', async () => {
    const user = setup()
    await showFar()
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    scrollTo(2100)
    await frame()
    expect(state()).toBe('shown')
    await user.keyboard('{Escape}')
    await stateAfter('hidden')
  })

  it('stays shown while keyboard focus is inside and hides once it leaves', async () => {
    focusVisible()
    const user = setup()
    await showFar()
    await user.tab()
    expect(screen.getByRole('banner').contains(document.activeElement)).toBe(true)
    scrollTo(2200)
    await frame()
    expect(state()).toBe('shown')
    ;(document.activeElement as HTMLElement).blur()
    await stateAfter('hidden')
  })

  it('hides on a scroll down after a mouse click left focus on a header button', async () => {
    const user = setup()
    scrollTo(2000)
    await frame()
    scrollTo(1900)
    await stateAfter('shown')
    await user.click(screen.getByRole('link', { name: 'Избранное' }))
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Избранное' }))
    scrollTo(2100)
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
