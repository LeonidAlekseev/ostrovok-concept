import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthDialog, AuthPage } from './AuthView'

const nav = vi.hoisted(() => ({ query: '', replace: vi.fn(), back: vi.fn() }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ replace: nav.replace, back: nav.back }),
}))

const supabase = vi.hoisted(() => ({
  configured: true,
  signInWithOtp: vi.fn(async (): Promise<{ error: { status: number } | null }> => ({ error: null })),
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => (supabase.configured ? { auth: { signInWithOtp: supabase.signInWithOtp } } : null),
}))

const demo = vi.hoisted(() => ({ signInDemo: vi.fn(async (): Promise<{ error?: string }> => ({})), reload: vi.fn() }))
vi.mock('@/app/auth/actions', () => ({ signInDemo: demo.signInDemo }))
vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  reloadSession: demo.reload,
}))

beforeEach(() => {
  nav.query = ''
  supabase.configured = true
  vi.clearAllMocks()
})

const type = async (user: ReturnType<typeof userEvent.setup>, label: string, text: string) =>
  user.type(screen.getByLabelText(label), text)

describe('login form', () => {
  it('asks no password', () => {
    render(<AuthPage mode="login" />)
    expect(screen.queryByLabelText('Пароль')).toBeNull()
    expect(screen.getByText(/Пароль не нужен/)).toBeTruthy()
  })

  it('shows an error at an email without @ and sends no link', async () => {
    const user = userEvent.setup()
    render(<AuthPage mode="login" />)
    await type(user, 'Email', 'anna.example.com')
    await user.click(screen.getByRole('button', { name: 'Отправить ссылку' }))
    expect(screen.getByText('Проверьте email')).toBeTruthy()
    expect(supabase.signInWithOtp).not.toHaveBeenCalled()
  })

  it('sends the link back to `next` and asks to check the email', async () => {
    nav.query = 'next=%2Ftrips'
    const user = userEvent.setup()
    render(<AuthPage mode="login" />)
    await type(user, 'Email', ' anna@example.com ')
    await user.click(screen.getByRole('button', { name: 'Отправить ссылку' }))
    expect(await screen.findByText('Проверьте почту')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('anna@example.com')
    expect(supabase.signInWithOtp).toHaveBeenCalledWith({
      email: 'anna@example.com',
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Ftrips`, data: undefined },
    })

    await user.click(screen.getByRole('button', { name: 'Изменить почту' }))
    expect(screen.getByLabelText('Email')).toBeTruthy()
  })

  it('sends an external `next` link to /', async () => {
    nav.query = `next=${encodeURIComponent('//evil.com')}`
    const user = userEvent.setup()
    render(<AuthPage mode="login" />)
    await type(user, 'Email', 'anna@example.com')
    await user.click(screen.getByRole('button', { name: 'Отправить ссылку' }))
    await screen.findByText('Проверьте почту')
    expect(supabase.signInWithOtp.mock.calls[0]).toMatchObject([
      { options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=%2F` } },
    ])
  })

  it('reports a failed send at the form', async () => {
    supabase.signInWithOtp.mockResolvedValueOnce({ error: { status: 429 } })
    const user = userEvent.setup()
    render(<AuthPage mode="login" />)
    await type(user, 'Email', 'anna@example.com')
    await user.click(screen.getByRole('button', { name: 'Отправить ссылку' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Слишком много писем подряд: попробуйте через минуту')
  })

  it('says sign-in is unavailable without the Supabase settings', async () => {
    supabase.configured = false
    const user = userEvent.setup()
    render(<AuthPage mode="login" />)
    await type(user, 'Email', 'anna@example.com')
    await user.click(screen.getByRole('button', { name: 'Отправить ссылку' }))
    expect(screen.getByRole('alert').textContent).toBe('Вход временно недоступен')
  })

  it('shows an expired link from the email', () => {
    nav.query = 'error=link'
    render(<AuthPage mode="login" />)
    expect(screen.getByRole('alert').textContent).toContain('Ссылка устарела')
  })
})

describe('register form', () => {
  it('checks the name and the agreement, then sends the link with the name', async () => {
    const user = userEvent.setup()
    render(<AuthPage mode="register" />)
    await type(user, 'Email', 'anna@example.com')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))
    expect(screen.getByText('Введите имя')).toBeTruthy()
    expect(screen.getByText('Нужно принять условия')).toBeTruthy()
    expect(supabase.signInWithOtp).not.toHaveBeenCalled()

    await type(user, 'Имя', ' Анна Петрова ')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))
    expect(await screen.findByText('Проверьте почту')).toBeTruthy()
    expect(supabase.signInWithOtp.mock.calls[0]).toMatchObject([{ options: { data: { name: 'Анна Петрова' } } }])
  })
})

describe('demo account', () => {
  it('signs in on the server, picks up the session and opens `next`', async () => {
    nav.query = 'next=%2Ftrips'
    const user = userEvent.setup()
    render(<AuthPage mode="login" />)
    await user.click(screen.getByRole('button', { name: 'Войти в демо-аккаунт' }))
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/trips'))
    expect(demo.signInDemo).toHaveBeenCalledWith('/trips')
    expect(demo.reload).toHaveBeenCalledTimes(1)
  })

  it('goes back under the dialog without `next`', async () => {
    const user = userEvent.setup()
    render(<AuthDialog mode="register" />)
    await user.click(screen.getByRole('button', { name: 'Войти в демо-аккаунт' }))
    await waitFor(() => expect(nav.back).toHaveBeenCalledTimes(1))
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it('shows the server error and stays', async () => {
    demo.signInDemo.mockResolvedValueOnce({ error: 'Вход временно недоступен' })
    const user = userEvent.setup()
    render(<AuthPage mode="login" />)
    await user.click(screen.getByRole('button', { name: 'Войти в демо-аккаунт' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Вход временно недоступен')
    expect(demo.reload).not.toHaveBeenCalled()
    expect(nav.replace).not.toHaveBeenCalled()
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

  it('closes with the close button', async () => {
    const user = userEvent.setup()
    render(<AuthDialog mode="login" />)
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    await waitFor(() => expect(nav.back).toHaveBeenCalledTimes(1))
  })

  it('keeps `next` in the switch link', () => {
    nav.query = 'next=%2Ftrips'
    render(<AuthDialog mode="login" />)
    expect(screen.getByRole('link', { name: 'Регистрация' }).getAttribute('href')).toBe('/register?next=%2Ftrips')
  })
})
