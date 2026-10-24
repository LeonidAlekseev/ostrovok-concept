import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as actions from '@/components/VibeSearch/actions'
import { DrawSearch } from './DrawSearch'
import { DrawSearchDialog } from './DrawSearchDialog'

// jsdom has no canvas: the painting itself is checked in the browser, the strokes here.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 300,
    height: 200,
  } as DOMRect)
})

afterEach(() => vi.restoreAllMocks())

/** The window as the section holds it: the colour of the brush lives outside. */
function Harness() {
  const [colorId, setColorId] = useState('blue')
  return <DrawSearchDialog open onOpenChange={() => {}} colorId={colorId} onColorIdChange={setColorId} />
}

const renderDialog = () => render(<Harness />)
const next = () => screen.getByRole('button', { name: 'Далее' }) as HTMLButtonElement
const status = () => screen.getByRole('status')
// Past the «Подбираем отель» of at least 1,5 s.
const RESULT = { timeout: 3000 }

/** Green from the keyboard, then «Далее». */
async function drawAndGo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Природа и тишина' }))
  await user.click(screen.getByRole('button', { name: 'Добавить мазок' }))
  await user.click(next())
}

// draw-search, Requirement: Блок на главной; Requirement: Превью рисунка
describe('DrawSearch section', () => {
  it('opens the window with an empty canvas and the palette', async () => {
    const user = userEvent.setup()
    render(<DrawSearch />)
    const section = screen.getByRole('region', { name: 'Нарисуй своё путешествие' })
    expect(section.getAttribute('id')).toBe('draw')

    await user.click(within(section).getByRole('button', { name: 'Нарисовать' }))
    const dialog = await screen.findByRole('dialog', { name: 'Нарисуй своё путешествие' })
    expect(within(dialog).getByText('Шаг 1 из 3')).toBeTruthy()
    expect(within(dialog).getByRole('img', { name: 'Пустой холст' })).toBeTruthy()
    const palette = within(dialog).getByRole('group', { name: 'Палитра настроений' })
    expect(within(palette).getAllByRole('button')).toHaveLength(10)
    expect(within(palette).getByRole('button', { name: 'Море и покой', pressed: true })).toBeTruthy()
  })

  // draw-search, Scenario: Цвет из превью
  it('opens the window on the colour chosen in the card', async () => {
    const user = userEvent.setup()
    render(<DrawSearch />)
    const card = screen.getByRole('group', { name: 'Цвет кисти' })
    expect(within(card).getAllByRole('button')).toHaveLength(10)

    await user.click(within(card).getByRole('button', { name: 'Рисовать цветом «Природа и тишина»' }))
    const dialog = await screen.findByRole('dialog', { name: 'Нарисуй своё путешествие' })
    expect(within(dialog).getByRole('button', { name: 'Природа и тишина', pressed: true })).toBeTruthy()
  })

  // draw-search, Scenario: Повтор анимации; Scenario: Меньше движения
  it('replays the hidden preview drawing, without motion when reduced', async () => {
    const user = userEvent.setup()
    const { container } = render(<DrawSearch />)
    const preview = container.querySelector('img[src="/images/draw/preview.webp"]')!
    expect(preview.getAttribute('aria-hidden')).toBe('true')
    expect(preview.className).toContain('animate-draw-reveal')
    expect(preview.className).toContain('motion-reduce:animate-none')

    await user.click(screen.getByRole('button', { name: 'Нарисовать заново' }))
    // A new element: its reveal starts again.
    const replayed = container.querySelector('img[src="/images/draw/preview.webp"]')
    expect(replayed).not.toBe(preview)
  })
})

// draw-search, Requirement: Холст и палитра
describe('DrawSearch canvas', () => {
  it('paints a stroke of the chosen colour with a pointer and takes it back with «Отменить»', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: 'Ночь и город' }))
    expect(screen.getByRole('button', { name: 'Ночь и город' }).getAttribute('aria-pressed')).toBe('true')
    const canvas = screen.getByRole('img', { name: 'Пустой холст' })
    expect(canvas.className).toContain('touch-none')

    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 10, clientY: 100, pointerType: 'touch' })
    for (let x = 20; x <= 290; x += 30) fireEvent.pointerMove(canvas, { pointerId: 1, clientX: x, clientY: 100 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    expect(screen.getByRole('img', { name: 'Рисунок: мазков — 1' })).toBeTruthy()
    expect(next().disabled).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Отменить' }))
    expect(screen.getByRole('img', { name: 'Пустой холст' })).toBeTruthy()
    expect(next().disabled).toBe(true)
  })

  it('«Очистить» drops every stroke', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: 'Добавить мазок' }))
    await user.click(screen.getByRole('button', { name: 'Добавить мазок' }))
    expect(screen.getByRole('img', { name: 'Рисунок: мазков — 2' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Очистить' }))
    expect(screen.getByRole('img', { name: 'Пустой холст' })).toBeTruthy()
  })

  // draw-search, Scenario: Пустой холст
  it('keeps «Далее» off below 3% of the canvas', () => {
    renderDialog()
    expect(next().disabled).toBe(true)
    const canvas = screen.getByRole('img', { name: 'Пустой холст' })
    // A short line: about 1% of the canvas.
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: 10 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    expect(screen.getByRole('img', { name: 'Рисунок: мазков — 1' })).toBeTruthy()
    expect(next().disabled).toBe(true)
  })

  it('paints green from the keyboard', async () => {
    const user = userEvent.setup()
    renderDialog()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Море и покой' })))
    // To «Природа и тишина» and choose it.
    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Природа и тишина' }))
    await user.keyboard('{Enter}')
    screen.getByRole('button', { name: 'Добавить мазок' }).focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('img', { name: 'Рисунок: мазков — 1' })).toBeTruthy()
    expect(next().disabled).toBe(false)
  })
})

// draw-search, Requirement: Пошаговое окно; Requirement: Подбор отеля на шаге настроения;
// Requirement: Готовый отель на последнем шаге
describe('DrawSearch steps', () => {
  it('reads the mood while the hotels are picked, then shows the hotel on its own', async () => {
    const user = userEvent.setup()
    // The hotels come when the test lets them.
    const pick = actions.vibeHotelsAction
    let release = () => {}
    vi.spyOn(actions, 'vibeHotelsAction').mockImplementationOnce(
      (answers) => new Promise((resolve) => (release = () => resolve(pick(answers)))),
    )
    renderDialog()
    await drawAndGo(user)

    // Step 2: the mood of the drawing and the search under it.
    const title = screen.getByRole('heading', { name: 'Настроение рисунка' })
    expect(status().textContent).toBe('Шаг 2 из 3: Настроение рисунка')
    await waitFor(() => expect(document.activeElement).toBe(title))
    // Green alone: away from the bustle and a boutique, which make «Эстет-минималист».
    expect(screen.getByText('Эстет-минималист')).toBeTruthy()
    const colors = screen.getByRole('region', { name: 'Цвета рисунка' })
    expect(within(colors).getByText(/Природа и тишина/).textContent).toBe('Природа и тишина 100%')
    const progress = screen.getByRole('progressbar', { name: 'Подбираем отель…' })
    expect(progress.getAttribute('aria-busy')).toBe('true')
    release()
    await waitFor(() => expect(progress.getAttribute('aria-busy')).toBe('false'))
    expect(progress.getAttribute('aria-valuenow')).toBe('100')

    // Step 3, by itself.
    const ready = await screen.findByRole('heading', { name: 'Ваш отель готов!' }, RESULT)
    expect(status().textContent).toBe('Шаг 3 из 3: Ваш отель готов!')
    await waitFor(() => expect(document.activeElement).toBe(ready))
    expect(screen.getByRole('img', { name: 'Острова в океане' })).toBeTruthy()
    const hotels = within(screen.getByRole('region', { name: 'Отели под настроение' })).getAllByRole('article')
    expect(hotels).toHaveLength(6)
    // Only what the product has: no flights, no transfers, no routes.
    expect(screen.queryByText(/Перел[её]т/)).toBeNull()
    expect(screen.queryByText(/Трансфер/)).toBeNull()
    expect(screen.queryByText(/маршрут/i)).toBeNull()
    expect(screen.getByText('Отели под настроение', { selector: 'li' })).toBeTruthy()
    expect(screen.getByText('Фото и отзывы гостей', { selector: 'li' })).toBeTruthy()

    // draw-search, Scenario: Посмотреть отель — the first hotel of the mood.
    const first = within(hotels[0]).getByRole('link').getAttribute('href')!
    const hotel = screen.getByRole('link', { name: 'Посмотреть отель' })
    expect(hotel.getAttribute('href')).toBe(first)
    expect(first).toMatch(/^\/hotels\/[a-z0-9-]+\?/)

    // draw-search, Scenario: Изменить рисунок
    await user.click(screen.getByRole('button', { name: 'Изменить рисунок' }))
    expect(status().textContent).toBe('Шаг 1 из 3: Нарисуй своё путешествие')
    expect(screen.getByRole('img', { name: 'Рисунок: мазков — 1' })).toBeTruthy()
    expect(next().disabled).toBe(false)
  })

  // draw-search, Scenario: Ошибка подбора
  it('shows the error and «Повторить», and stays on step 2', async () => {
    const user = userEvent.setup()
    const pick = vi.spyOn(actions, 'vibeHotelsAction').mockRejectedValueOnce(new Error('down'))
    renderDialog()
    await drawAndGo(user)

    await screen.findByText('Не удалось подобрать отели. Попробуйте ещё раз.')
    expect(status().textContent).toContain('Шаг 2 из 3')
    expect(screen.queryByRole('progressbar')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(pick).toHaveBeenCalledTimes(2)
    await screen.findByRole('heading', { name: 'Ваш отель готов!' }, RESULT)
  })
})
