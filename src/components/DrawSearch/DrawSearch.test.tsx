import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routeCards } from '../../test/catalog'
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

const renderDialog = () => render(<DrawSearchDialog open onOpenChange={() => {}} routes={routeCards()} />)
const show = () => screen.getByRole('button', { name: 'Показать путешествие' }) as HTMLButtonElement

// draw-search, Requirement: Блок на главной
describe('DrawSearch section', () => {
  it('opens the window with an empty canvas and the palette', async () => {
    const user = userEvent.setup()
    render(<DrawSearch routes={routeCards()} />)
    const section = screen.getByRole('region', { name: 'Нарисуй своё путешествие' })
    expect(section.getAttribute('id')).toBe('draw')

    await user.click(within(section).getByRole('button', { name: 'Нарисовать' }))
    const dialog = await screen.findByRole('dialog', { name: 'Нарисуй своё путешествие' })
    expect(within(dialog).getByRole('img', { name: 'Пустой холст' })).toBeTruthy()
    const palette = within(dialog).getByRole('group', { name: 'Палитра настроений' })
    expect(within(palette).getAllByRole('button')).toHaveLength(10)
    expect(within(palette).getByRole('button', { name: 'Море и покой', pressed: true })).toBeTruthy()
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
    expect(show().disabled).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Отменить' }))
    expect(screen.getByRole('img', { name: 'Пустой холст' })).toBeTruthy()
    expect(show().disabled).toBe(true)
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
  it('keeps «Показать путешествие» off below 3% of the canvas', () => {
    renderDialog()
    expect(show().disabled).toBe(true)
    const canvas = screen.getByRole('img', { name: 'Пустой холст' })
    // A short line: about 1% of the canvas.
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: 10 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    expect(screen.getByRole('img', { name: 'Рисунок: мазков — 1' })).toBeTruthy()
    expect(show().disabled).toBe(true)
  })
})

// draw-search, Requirement: Рисование с клавиатуры; Requirement: Итог рисунка
describe('DrawSearch keyboard and result', () => {
  it('paints green from the keyboard, shows the journey and draws again', async () => {
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

    await user.click(show())
    // Green alone: away from the bustle and a boutique. Each matches one pole of «Тихая гавань» and of
    // «Эстет-минималист»; the boutique is the main axis of the latter.
    const heading = await screen.findByRole('heading', { level: 3 })
    expect(heading.textContent).toBe('Эстет-минималист')
    expect(screen.getByText('Настроение рисунка')).toBeTruthy()
    const colors = screen.getByRole('region', { name: 'Цвета рисунка' })
    expect(within(colors).getByText(/Природа и тишина/).textContent).toBe('Природа и тишина 100%')
    const ready = screen.getByRole('region', { name: 'Готовый маршрут' })
    expect(within(ready).getByRole('link').getAttribute('href')).toMatch(/^\/routes\/[a-z0-9-]+$/)
    const hotels = within(screen.getByRole('region', { name: 'Отели под настроение' })).getAllByRole('article')
    expect(hotels).toHaveLength(6)

    await user.click(screen.getByRole('button', { name: 'Нарисовать заново' }))
    expect(screen.getByRole('img', { name: 'Пустой холст' })).toBeTruthy()
    expect(show().disabled).toBe(true)
  })
})
