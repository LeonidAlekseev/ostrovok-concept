import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, todayIso } from '../../lib/dates'
import { StarSearch } from './StarSearch'
import { StarSearchDialog } from './StarSearchDialog'

// jsdom has no canvas and no MediaRecorder: the recording itself is checked in the browser.
const video = new File(['video'], 'ostrovok-zvezdy.mp4', { type: 'video/mp4' })
vi.mock('./starVideo', () => ({ renderReadingVideo: vi.fn(async () => video) }))

const share = vi.fn()
const nav = navigator as unknown as Record<string, unknown>

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:video')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
  share.mockReset()
  delete nav.share
  delete nav.canShare
  delete (window as Partial<Window>).matchMedia
})

const reduceMotion = () => {
  window.matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList)
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Как вас зовут?'), 'Анна')
  await user.selectOptions(screen.getByRole('combobox', { name: 'День' }), '21')
  await user.selectOptions(screen.getByRole('combobox', { name: 'Месяц' }), 'марта')
}

function renderDialog() {
  return render(<StarSearchDialog open onOpenChange={() => {}} />)
}

// star-search, Requirement: Блок на главной
describe('StarSearch section', () => {
  it('opens the window with the focus in the first field', async () => {
    const user = userEvent.setup()
    render(<StarSearch />)
    expect(screen.getByRole('heading', { name: 'Поиск по звёздам' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Найти по звёздам' }))
    const dialog = await screen.findByRole('dialog', { name: 'Поиск по звёздам' })
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByLabelText('Как вас зовут?')))
  })
})

// star-search, Requirement: Анкета
describe('StarSearch form', () => {
  it('picks the check-in in the search calendar, where past days are not available', async () => {
    reduceMotion()
    const user = userEvent.setup()
    renderDialog()
    await fillForm(user)
    const today = todayIso()
    const later = addDays(today, 10)

    await user.click(screen.getByRole('button', { name: /^Дата заезда: / }))
    const calendar = await screen.findByRole('dialog', { name: 'Выбор даты заезда' })
    const day = (iso: string) => calendar.querySelector<HTMLButtonElement>(`[data-date="${iso}"]`)
    expect(day(addDays(today, -1))?.disabled).toBe(true)
    await user.click(day(later)!)
    expect(screen.queryByRole('dialog', { name: 'Выбор даты заезда' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Гадать' }))
    const url = new URL(screen.getAllByRole('link')[0].getAttribute('href')!, 'https://x')
    expect(url.searchParams.get('checkin')).toBe(later)
    expect(url.searchParams.get('checkout')).toBe(addDays(later, 2))
  })

  it('shows the sign as soon as the birthday is known', async () => {
    const user = userEvent.setup()
    renderDialog()
    await fillForm(user)
    expect(screen.getByText(/Ваш знак/).textContent).toContain('Овен ♈')
    expect(screen.getByText(/на границе знаков: Рыбы\/Овен/)).toBeTruthy()
  })

  it('reports a missing name, then a missing birthday, and focuses the field', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: 'Гадать' }))
    // Every error at once, the name first.
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([
      'Как вас зовут? Звёздам нужно знать, для кого гадать',
      'Укажите день и месяц рождения',
    ])
    expect(document.activeElement).toBe(screen.getByLabelText('Как вас зовут?'))
    expect(screen.queryByText('Звёзды совещаются…')).toBeNull()

    await user.type(screen.getByLabelText('Как вас зовут?'), 'Анна')
    await user.click(screen.getByRole('button', { name: 'Гадать' }))
    expect(screen.getByRole('alert').textContent).toBe('Укажите день и месяц рождения')
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'День' }))
  })

  it('rejects a day the month does not have', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByLabelText('Как вас зовут?'), 'Анна')
    await user.selectOptions(screen.getByRole('combobox', { name: 'День' }), '31')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Месяц' }), 'апреля')
    await user.click(screen.getByRole('button', { name: 'Гадать' }))
    expect(screen.getByRole('alert').textContent).toBe('В этом месяце нет такого дня')
  })

  it('asks for the companion sign only for a pair', async () => {
    const user = userEvent.setup()
    renderDialog()
    expect(screen.queryByRole('combobox', { name: 'Знак спутника' })).toBeNull()
    await user.click(screen.getByRole('radio', { name: 'Вдвоём' }))
    expect(screen.getByRole('combobox', { name: 'Знак спутника' })).toBeTruthy()
  })
})

// star-search, Requirement: Гадание и результат
describe('StarSearch reading', () => {
  it('reads the stars for 2.5 s, then shows the result', async () => {
    const user = userEvent.setup()
    renderDialog()
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Гадать' }))

    expect(screen.getByRole('status').textContent).toBe('Звёзды совещаются…')
    expect(screen.queryByRole('heading', { name: /ваш знак/ })).toBeNull()
    expect(await screen.findByRole('heading', { name: /Анна, ваш знак — Овен/ }, { timeout: 4000 })).toBeTruthy()
  })

  it('skips the animation under reduced motion and links the hotels with the dates of the trip', async () => {
    reduceMotion()
    const user = userEvent.setup()
    renderDialog()
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Гадать' }))

    const heading = screen.getByRole('heading', { name: /Анна, ваш знак — Овен/ })
    expect(document.activeElement).toBe(heading)
    expect(screen.getAllByRole('status').some((s) => /^Звёзды выбрали: /.test(s.textContent!))).toBe(true)
    expect(screen.getByText(/Гороскоп — для настроения, а не для планов/)).toBeTruthy()

    const checkIn = addDays(todayIso(), 1)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(3)
    for (const link of links) {
      const url = new URL(link.getAttribute('href')!, 'https://x')
      expect(url.pathname).toMatch(/^\/hotels\/[a-z0-9-]+$/)
      expect(Object.fromEntries(url.searchParams)).toEqual({
        checkin: checkIn,
        checkout: addDays(checkIn, 2),
        adults: '2',
        rooms: '1',
      })
    }
  })

  it('is the same for the same answers', async () => {
    reduceMotion()
    const user = userEvent.setup()
    renderDialog()
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Гадать' }))
    const first = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    await user.click(screen.getByRole('button', { name: 'Гадать заново' }))
    await user.click(screen.getByRole('button', { name: 'Гадать' }))
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(first)
  })
})

// star-search, Requirement: Отправка видео
describe('StarSearch video', () => {
  async function showResult(user: ReturnType<typeof userEvent.setup>) {
    reduceMotion()
    renderDialog()
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Гадать' }))
  }

  it('shares the video file when the share sheet takes files', async () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: (type: string) => type === 'video/mp4' })
    Object.assign(nav, { canShare: () => true, share })
    share.mockResolvedValue(undefined)
    const user = userEvent.setup()
    await showResult(user)

    await user.click(screen.getByRole('button', { name: 'Создать видео для друзей' }))
    await user.click(await screen.findByRole('button', { name: 'Поделиться видео' }))
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [video] }))
    expect(await screen.findByText('Видео отправлено')).toBeTruthy()
  })

  it('offers to download the video and copy the link when files cannot be shared', async () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true })
    Object.assign(nav, { canShare: () => false })
    const user = userEvent.setup()
    await showResult(user)

    await user.click(screen.getByRole('button', { name: 'Создать видео для друзей' }))
    expect(await screen.findByRole('button', { name: 'Скачать видео' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Скопировать ссылку' }))
    expect(await navigator.clipboard.readText()).toBe(window.location.origin)
    expect(screen.queryByRole('button', { name: 'Поделиться видео' })).toBeNull()
  })

  it('shares the text and the link without MediaRecorder', async () => {
    vi.stubGlobal('MediaRecorder', undefined)
    Object.assign(nav, { share })
    share.mockResolvedValue(undefined)
    const user = userEvent.setup()
    await showResult(user)

    expect(screen.queryByRole('button', { name: 'Создать видео для друзей' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Поделиться' }))
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Анна'), url: window.location.origin }),
    )
  })
})
