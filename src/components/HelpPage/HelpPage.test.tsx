import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { faq } from '@/data/faq'
import { HelpPage } from './HelpPage'

afterEach(() => {
  window.location.hash = ''
  vi.unstubAllGlobals()
})

const scrollIntoView = vi.fn()
Element.prototype.scrollIntoView = scrollIntoView

describe('help page', () => {
  it('shows every category', () => {
    render(<HelpPage />)
    for (const name of ['Бронирование', 'Оплата', 'Отмена и изменения', 'Аккаунт'])
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /\?$/ })).toHaveLength(faq.length)
  })

  it('filters by the query and drops empty categories', async () => {
    const user = userEvent.setup()
    render(<HelpPage />)
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по вопросам' }), 'ОТМЕН')
    const shown = screen.getAllByRole('button', { name: /\?$/ })
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.length).toBeLessThan(faq.length)
    expect(screen.queryByRole('heading', { level: 2, name: 'Аккаунт' })).toBeNull()
  })

  it('says nothing was found and links to the form', async () => {
    const user = userEvent.setup()
    render(<HelpPage />)
    await user.type(screen.getByRole('searchbox'), 'qwertyzzz')
    expect(screen.getByText(/Ничего не нашлось/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Напишите нам' }).getAttribute('href')).toBe('#contact')
  })

  it('opens the question named by the hash', async () => {
    window.location.hash = '#free-cancel'
    render(<HelpPage />)
    const trigger = screen.getByRole('button', { name: faq.find((q) => q.id === 'free-cancel')!.question })
    await vi.waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'))
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1)
    await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
  })
})

describe('support form', () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>, label: string, text: string) =>
    user.type(screen.getByLabelText(label), text)

  it('shows errors for the required fields and keeps the booking number optional', async () => {
    const user = userEvent.setup()
    render(<HelpPage />)
    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(screen.getByText('Введите имя')).toBeTruthy()
    expect(screen.getByText('Введите email')).toBeTruthy()
    expect(screen.getByText('Опишите вопрос')).toBeTruthy()
    expect(screen.getAllByText(/^(Введите|Проверьте|Опишите)/)).toHaveLength(3)
  })

  it('rejects a wrong email', async () => {
    const user = userEvent.setup()
    render(<HelpPage />)
    await fill(user, 'Имя', 'Анна')
    await fill(user, 'Email', 'anna')
    await fill(user, 'Сообщение', 'Привет')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(screen.getByText('Проверьте email')).toBeTruthy()
  })

  it('confirms with the email and makes no network request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<HelpPage />)
    await fill(user, 'Имя', 'Анна')
    await fill(user, 'Email', 'anna@example.com')
    await fill(user, 'Сообщение', 'Привет')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(screen.getByRole('status').textContent).toContain(
      'Обращение отправлено (демо): ответ придёт на anna@example.com',
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
  })
})
