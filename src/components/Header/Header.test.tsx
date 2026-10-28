import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sessionStore } from '@/lib/session'
import { favoritesStore } from '@/lib/storage'
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
    expect(screen.getByRole('link', { name: 'О!бъективно — на главную' }).getAttribute('href')).toBe('/')
  })

  it('widens the header to the search page width from 3xl only on /search', () => {
    const logo = () => screen.getByRole('link', { name: 'О!бъективно — на главную' }).parentElement!.className
    window.history.pushState({}, '', '/search')
    setup()
    expect(logo()).toMatch(/(^|\s)3xl:max-w-\(--page-max-wide\)(\s|$)/)
    expect(logo()).toMatch(/(^|\s)3xl:px-\(--page-x\)(\s|$)/)
    window.history.pushState({}, '', '/')
  })

  it('keeps the header width on other pages', () => {
    setup()
    expect(screen.getByRole('link', { name: 'О!бъективно — на главную' }).parentElement!.className).not.toMatch(
      /3xl:max-w-/,
    )
  })

  it('shows only the logo and the menu button in the header, whatever the screen', () => {
    setup()
    const actions = [...screen.getByRole('banner').querySelectorAll('[aria-label]')].map((el) =>
      el.getAttribute('aria-label'),
    )
    expect(actions).toEqual(['О!бъективно — на главную', 'Открыть меню'])
    expect(screen.queryByRole('link', { name: 'Избранное' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Уведомления' })).toBeNull()
  })

  it('opens and closes the menu on the button, "Escape" and a second press', async () => {
    const user = setup()
    const button = screen.getByRole('button', { name: 'Открыть меню' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    await user.click(button)
    const panel = screen.getByRole('dialog', { name: 'Меню' })
    const open = screen.getByRole('button', { name: 'Закрыть меню' })
    expect(open.getAttribute('aria-expanded')).toBe('true')
    expect(open.getAttribute('aria-controls')).toBe(panel.id)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    await user.click(screen.getByRole('button', { name: 'Закрыть меню' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('reaches the menu items from the keyboard', async () => {
    const user = setup()
    screen.getByRole('button', { name: 'Открыть меню' }).focus()
    await user.keyboard('{Enter}')
    const panel = screen.getByRole('dialog', { name: 'Меню' })
    expect(panel.contains(document.activeElement)).toBe(true)
    await user.tab()
    expect(panel.contains(document.activeElement)).toBe(true)
    expect(document.activeElement?.getAttribute('href')).toBe('/search')
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
    await user.click(screen.getByRole('link', { name: 'О!бъективно — на главную' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  // site-header, Requirement: Ссылки на поиск в меню, Scenario: Меню
  it('lists the sections in the menu and closes it on a choice', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    const nav = screen.getByRole('navigation', { name: 'Основное меню' })
    const items = [...nav.querySelectorAll('a, button')].map((el) => [el.textContent, el.getAttribute('href')])
    expect(items).toEqual([
      ['Спросить Эвал', '/assistant'],
      ['Искать вручную', '/search'],
      ['Мои поездки', '/trips'],
      ['Избранное', '/favorites'],
      ['API', '/api/docs'],
      ['Войти', '/login'],
    ])
    await user.click(screen.getByRole('link', { name: 'Избранное' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Меню' })).toBeNull())
  })

  // site-header, Requirement: Меню разделов, Scenario: Без уведомлений и поддержки
  it('has no «Уведомления» and no «Поддержка» in the menu, but keeps «Мои поездки» and «API»', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    const nav = screen.getByRole('navigation', { name: 'Основное меню' })
    expect(within(nav).queryByText('Уведомления')).toBeNull()
    expect(within(nav).queryByText('Поддержка')).toBeNull()
    expect(within(nav).getByRole('link', { name: 'Мои поездки' }).getAttribute('href')).toBe('/trips')
    expect(within(nav).getByRole('link', { name: 'API' }).getAttribute('href')).toBe('/api/docs')
  })

  // site-header, Requirement: Меню разделов, Scenario: Документация API
  it.each(['production', 'preview', 'development'])('links the API docs in %s', async (env) => {
    vi.stubEnv('APP_ENV', env)
    vi.resetModules()
    const { Header: EnvHeader } = await import('./Header')
    const user = userEvent.setup()
    render(<EnvHeader />)
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    expect(screen.getByRole('link', { name: 'API' }).getAttribute('href')).toBe('/api/docs')
    await user.click(screen.getByRole('link', { name: 'API' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Меню' })).toBeNull())
    vi.unstubAllEnvs()
  })

  it('offers a guest «Войти» in the menu, without an account block', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    expect(screen.getByRole('link', { name: 'Войти' }).getAttribute('href')).toBe('/login')
    expect(screen.queryByRole('region', { name: 'Аккаунт' })).toBeNull()
  })

  it('shows the name and «Выйти» in the menu once signed in, and "Выйти" ends the session only', async () => {
    favoritesStore.set(['h1'])
    sessionStore.set({ name: 'anna', email: 'anna@example.com' })
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    expect(screen.queryByRole('link', { name: 'Войти' })).toBeNull()
    const account = screen.getByRole('region', { name: 'Аккаунт' })
    expect(within(account).getByText('anna')).toBeTruthy()
    expect(account.textContent).toContain('anna@example.com')
    expect(screen.getByRole('link', { name: 'Мои поездки' }).getAttribute('href')).toBe('/trips')

    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(sessionStore.get()).toBeNull()
    expect(favoritesStore.get()).toEqual(['h1'])
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Меню' })).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }))
    expect(await screen.findByRole('link', { name: 'Войти' })).toBeTruthy()
  })
})

describe('Header chrome', () => {
  // site-header, Requirement: Оформление шапки — Серверный HTML главной
  it.each(['/', '/search', '/hotels/prague-old-town-lantern', '/hotels/prague-old-town-lantern/rooms', '/index'])(
    'the server markup of %s does not depend on the pathname',
    (path) => {
      window.history.pushState({}, '', path)
      const html = renderToString(<Header />)
      window.history.pushState({}, '', '/')
      // Grey by default; the page content (the hero) turns it transparent through CSS alone.
      expect(html).toMatch(/<header class="[^"]*\bbg-background\b/)
      expect(html).toContain('group-has-[#hero-title]/page:bg-transparent')
      expect(html).not.toContain('data-header-photo')
    },
  )

  it('keeps the logo and icons blue on the hotel page', () => {
    window.history.pushState({}, '', '/hotels/prague-old-town-lantern')
    setup()
    window.history.pushState({}, '', '/')
    for (const el of [
      screen.getByRole('link', { name: 'О!бъективно — на главную' }),
      screen.getByRole('button', { name: 'Открыть меню' }),
    ]) {
      expect(el.className).toMatch(/(^|\s)text-primary(\s|$)/)
      expect(el.className).not.toContain('text-white')
    }
  })

  it('is flat and blue, never sticky', () => {
    setup()
    const header = screen.getByRole('banner')
    expect(header.className).not.toMatch(/rounded|shadow|fixed|sticky/)
    expect(screen.getByRole('link', { name: 'О!бъективно — на главную' }).className).toMatch(/(^|\s)text-primary(\s|$)/)
  })

  it('scrolls with the page', () => {
    setup()
    expect(screen.getByRole('banner').className).toMatch(/\babsolute\b/)
    expect(screen.getByRole('banner').className).not.toMatch(/\b(fixed|sticky)\b/)
  })
})
