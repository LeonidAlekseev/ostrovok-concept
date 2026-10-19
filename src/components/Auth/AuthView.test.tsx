import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sessionStore } from '@/lib/storage'
import { AuthDialog, AuthPage } from './AuthView'

const nav = vi.hoisted(() => ({ query: '', replace: vi.fn(), back: vi.fn() }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ replace: nav.replace, back: nav.back }),
}))

beforeEach(() => {
  nav.query = ''
  nav.replace.mockClear()
  nav.back.mockClear()
})
afterEach(() => localStorage.clear())

const type = async (user: ReturnType<typeof userEvent.setup>, label: string, text: string) =>
  user.type(screen.getByLabelText(label), text)

describe('login form', () => {
  it('names the demo rules in the form', () => {
    render(<AuthPage mode="login" />)
    expect(screen.getByText(/любой email и пароль от 8 символов/).textContent).toContain('Пароль нигде не сохраняется')
  })

  it('shows an error at a short password and creates no session', async () => {
    const user = userEvent.setup()
    render(<AuthPage mode="login" />)
    await type(user, 'Email', 'anna@example.com')
    await type(user, 'Пароль', '12345')
    await user.click(screen.getByRole('button', { name: 'Войти' }))
    expect(screen.getByText('Не меньше 8 символов')).toBeTruthy()
    expect(sessionStore.get()).toBeNull()
  })

  it('signs in and opens the home page from the full page', async () => {
    const user = userEvent.setup()
    render(<AuthPage mode="login" />)
    await type(user, 'Email', 'anna@example.com')
    await type(user, 'Пароль', '12345678')
    await user.click(screen.getByRole('button', { name: 'Войти' }))
    expect(sessionStore.get()).toEqual({ name: 'anna', email: 'anna@example.com' })
    expect(nav.replace).toHaveBeenCalledWith('/')
  })

  it('goes to an internal `next` and to / for an external one', async () => {
    for (const [next, target] of [
      ['/trips', '/trips'],
      ['//evil.com', '/'],
      ['https://evil.com', '/'],
    ]) {
      nav.query = `next=${encodeURIComponent(next)}`
      nav.replace.mockClear()
      const user = userEvent.setup()
      const { unmount } = render(<AuthPage mode="login" />)
      await type(user, 'Email', 'anna@example.com')
      await type(user, 'Пароль', '12345678')
      await user.click(screen.getByRole('button', { name: 'Войти' }))
      expect(nav.replace).toHaveBeenCalledWith(target)
      unmount()
    }
  })
})

describe('register form', () => {
  it('checks the repeat and the agreement, then signs in under the given name', async () => {
    const user = userEvent.setup()
    render(<AuthPage mode="register" />)
    await type(user, 'Имя', 'Анна Петрова')
    await type(user, 'Email', 'anna@example.com')
    await type(user, 'Пароль', '12345678')
    await type(user, 'Повторите пароль', '1234567')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))
    expect(screen.getByText('Пароли не совпадают')).toBeTruthy()
    expect(screen.getByText('Нужно принять условия')).toBeTruthy()
    expect(sessionStore.get()).toBeNull()

    await user.type(screen.getByLabelText('Повторите пароль'), '8')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))
    expect(sessionStore.get()).toEqual({ name: 'Анна Петрова', email: 'anna@example.com' })
  })
})

describe('dialog', () => {
  it('is a dialog with the switch, and Escape goes back', async () => {
    const user = userEvent.setup()
    render(<AuthDialog mode="login" />)
    expect(screen.getByRole('dialog', { name: 'Вход' })).toBeTruthy()
    const switcher = screen.getByRole('navigation', { name: 'Вход или регистрация' })
    expect(screen.getByRole('link', { name: 'Регистрация' }).getAttribute('href')).toBe('/register')
    expect(switcher.querySelector('[aria-current=page]')?.textContent).toBe('Вход')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(nav.back).toHaveBeenCalledTimes(1))
  })

  it('closes with the close button and goes back after signing in without `next`', async () => {
    const user = userEvent.setup()
    render(<AuthDialog mode="login" />)
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    await waitFor(() => expect(nav.back).toHaveBeenCalledTimes(1))

    nav.back.mockClear()
    await type(user, 'Email', 'anna@example.com')
    await type(user, 'Пароль', '12345678')
    await user.click(screen.getByRole('button', { name: 'Войти' }))
    expect(nav.back).toHaveBeenCalledTimes(1)
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it('keeps `next` in the switch link', () => {
    nav.query = 'next=%2Ftrips'
    render(<AuthDialog mode="login" />)
    expect(screen.getByRole('link', { name: 'Регистрация' }).getAttribute('href')).toBe('/register?next=%2Ftrips')
  })
})
