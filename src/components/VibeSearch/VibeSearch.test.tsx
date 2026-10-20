import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, todayIso } from '../../lib/dates'
import { VibeSearch } from './VibeSearch'
import { VibeSearchDialog } from './VibeSearchDialog'

// jsdom has no canvas: the picture itself is checked in the browser.
const image = new File(['png'], 'ostrovok-vibe.png', { type: 'image/png' })
vi.mock('./vibeImage', () => ({ renderVibeImage: vi.fn(async () => image) }))

const share = vi.fn()
const canShare = vi.fn()
const nav = navigator as unknown as Record<string, unknown>

beforeEach(() => {
  share.mockReset().mockResolvedValue(undefined)
  canShare.mockReset().mockReturnValue(true)
  Object.assign(nav, { share, canShare })
  URL.createObjectURL = vi.fn(() => 'blob:vibe')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  delete nav.share
  delete nav.canShare
})

const renderDialog = () => render(<VibeSearchDialog open onOpenChange={() => {}} />)

async function answerAll(user: ReturnType<typeof userEvent.setup>, option: string | RegExp) {
  for (let i = 0; i < 7; i++)
    await user.click(screen.getAllByRole(option === 'Не могу выбрать' ? 'button' : 'radio', { name: option })[0])
}

// vibe-search, Requirement: Блок на главной
describe('VibeSearch section', () => {
  it('shows «Тихий вечер» vs «Шумная вечеринка» and opens the window with the first pair', async () => {
    const user = userEvent.setup()
    render(<VibeSearch />)
    const section = screen.getByRole('region', { name: 'Поиск вайба' })
    expect(section.getAttribute('id')).toBe('vibe')
    expect(within(section).getByText('Тихий вечер')).toBeTruthy()
    expect(within(section).getByText('Шумная вечеринка')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Найти свой вайб' }))
    const dialog = await screen.findByRole('dialog', { name: 'Поиск вайба' })
    expect(within(dialog).getByRole('radio', { name: 'Тихий вечер' })).toBeTruthy()
    expect(within(dialog).getByRole('radio', { name: 'Шумная вечеринка' })).toBeTruthy()
    expect(within(dialog).getByText('1 из 7')).toBeTruthy()
  })
})

// vibe-search, Requirement: Выбор
describe('VibeSearch pairs', () => {
  it('moves to the next pair on a choice and announces it', async () => {
    const user = userEvent.setup()
    renderDialog()
    expect(screen.queryByRole('button', { name: 'Назад' })).toBeNull()
    await user.click(screen.getByRole('radio', { name: 'Тихий вечер' }))
    expect(screen.getByText('2 из 7')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Море' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Город' })).toBeTruthy()
    expect(screen.getByText('2 из 7: Море или Город').getAttribute('role')).toBe('status')
  })

  it('counts «Не могу выбрать» as 50/50 and goes on', async () => {
    const user = userEvent.setup()
    renderDialog()
    await answerAll(user, 'Не могу выбрать')
    expect(document.activeElement).toBe(await screen.findByRole('heading', { name: 'Баланс во всём' }))
    const stats = screen.getByRole('list', { name: 'Статистика вайба' })
    expect(within(stats).getAllByRole('listitem')).toHaveLength(7)
    expect(within(stats).getByText('Тихий вечер 50%')).toBeTruthy()
    expect(within(stats).getByText('50% Шумная вечеринка')).toBeTruthy()
  })

  it('goes back to the previous pair with its answer kept', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('radio', { name: 'Шумная вечеринка' }))
    await user.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByText('1 из 7')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Шумная вечеринка' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Тихий вечер' }).getAttribute('aria-checked')).toBe('false')
    // «Назад» is gone with the first pair: the focus is on its first option.
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Тихий вечер' }))
  })

  it('is a radiogroup of two radios that the arrows switch between without moving on', async () => {
    const user = userEvent.setup()
    renderDialog()
    const group = screen.getByRole('radiogroup', { name: 'Что ближе: Тихий вечер или Шумная вечеринка' })
    expect(within(group).getAllByRole('radio')).toHaveLength(2)
    const left = screen.getByRole('radio', { name: 'Тихий вечер' })
    const right = screen.getByRole('radio', { name: 'Шумная вечеринка' })
    await waitFor(() => expect(document.activeElement).toBe(left))
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(right)
    expect(screen.getByText('1 из 7')).toBeTruthy()
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(left)
    await user.keyboard('{ArrowDown}{Enter}')
    expect(screen.getByText('2 из 7')).toBeTruthy()
  })

  it('works from the keyboard', async () => {
    const user = userEvent.setup()
    renderDialog()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Тихий вечер' })))
    for (let i = 0; i < 7; i++) {
      // The focus stays on the left option from pair to pair.
      expect(screen.getByText(`${i + 1} из 7`)).toBeTruthy()
      await user.keyboard('{Enter}')
    }
    expect(document.activeElement).toBe(await screen.findByRole('heading', { name: 'Тихая гавань' }))
  })
})

// vibe-search, Requirement: Статистика вайба; Requirement: Отели под настроение
describe('VibeSearch result', () => {
  it('shows the vibe, the shares and six hotels from different cities with start dates', async () => {
    const user = userEvent.setup()
    renderDialog()
    await answerAll(
      user,
      /^(Тихий вечер|Море|Уютный бутик|Спа и бассейн|Завтрак в номер|Без лишних трат|Подальше от суеты)$/,
    )
    expect(await screen.findByRole('heading', { name: 'Тихая гавань' })).toBeTruthy()
    expect(screen.getByText('Тихий вечер 100%')).toBeTruthy()
    expect(screen.getByText('0% Шумная вечеринка')).toBeTruthy()

    const hotels = within(screen.getByRole('region', { name: 'Отели под настроение' })).getAllByRole('article')
    expect(hotels).toHaveLength(6)
    const cities = hotels.map((hotel) => within(hotel).getByRole('heading').nextElementSibling?.textContent)
    expect(new Set(cities).size).toBe(6)
    const tomorrow = addDays(todayIso(), 1)
    for (const hotel of hotels) {
      const url = new URL(within(hotel).getByRole('link').getAttribute('href')!, 'https://x')
      expect(url.pathname).toMatch(/^\/hotels\/[a-z0-9-]+$/)
      expect(Object.fromEntries(url.searchParams)).toEqual({
        checkin: tomorrow,
        checkout: addDays(tomorrow, 1),
        adults: '2',
        rooms: '1',
      })
    }
  })

  it('starts over', async () => {
    const user = userEvent.setup()
    renderDialog()
    await answerAll(user, 'Не могу выбрать')
    await user.click(await screen.findByRole('button', { name: 'Пройти заново' }))
    expect(screen.getByText('1 из 7')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Тихий вечер' }).getAttribute('aria-checked')).toBe('false')
  })
})

// vibe-search, Requirement: Картинка для отправки
describe('VibeSearch picture', () => {
  async function finish() {
    const user = userEvent.setup()
    renderDialog()
    await answerAll(user, 'Не могу выбрать')
    await screen.findByRole('img', { name: 'Картинка «Мой вайб — Баланс во всём»' })
    return user
  }

  it('sends the PNG through the share sheet', async () => {
    const user = await finish()
    await user.click(screen.getByRole('button', { name: 'Поделиться' }))
    expect(canShare).toHaveBeenCalledWith({ files: [image] })
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [image], title: 'Островок! Поиск вайба' }))
    expect(await screen.findByText('Картинка отправлена')).toBeTruthy()
  })

  it('takes a closed share sheet for no error', async () => {
    share.mockRejectedValue(new DOMException('Closed', 'AbortError'))
    const user = await finish()
    await user.click(screen.getByRole('button', { name: 'Поделиться' }))
    await waitFor(() => expect(share).toHaveBeenCalled())
    expect(screen.queryByText(/Не удалось/)).toBeNull()
  })

  it('offers a download and the link without file sharing', async () => {
    canShare.mockReturnValue(false)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = await finish()
    expect(screen.queryByRole('button', { name: 'Поделиться' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Скачать картинку' }))
    expect(click).toHaveBeenCalled()
    expect(screen.getByText('Картинка скачивается')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Скопировать ссылку' }))
    // user-event puts its own clipboard in place.
    expect(await navigator.clipboard.readText()).toBe(window.location.origin)
    expect(await screen.findByText('Ссылка скопирована')).toBeTruthy()
    click.mockRestore()
  })
})
