import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getHotel, type Review } from '@/lib/catalog'
import { ReviewsDialog } from './Reviews'

const lantern = getHotel('prague-old-town-lantern')!

const reviews: Review[] = Array.from({ length: 12 }, (_, i) => ({
  id: `r${i}`,
  author: `Автор ${i}`,
  date: `2026-09-${String(i + 1).padStart(2, '0')}`,
  score: 8,
  pros: `Хорошо ${i}`,
  ...(i % 2 === 0 && { cons: `Плохо ${i}` }),
  helpful: i,
}))

const hotel = { ...lantern, reviewCount: 120, reviews }
const authors = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByText(/^Автор/)
    .map((a) => a.textContent)

const open = async (user: ReturnType<typeof userEvent.setup>, shown = hotel) => {
  render(<ReviewsDialog hotel={shown} />)
  await user.click(screen.getByRole('button', { name: /^Читать отзывы/ }))
  return screen.getByRole('dialog', { name: 'Отзывы' })
}

// hotel-page, Requirement: Отзывы
describe('ReviewsDialog', () => {
  it('shows 5 reviews, then 5 more, then the rest without the button', async () => {
    const user = userEvent.setup()
    render(<ReviewsDialog hotel={hotel} />)
    expect(screen.queryByText(/^Автор/)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Читать отзывы (120)' }))
    const dialog = screen.getByRole('dialog', { name: 'Отзывы' })
    expect(authors(dialog)).toHaveLength(5)
    await user.click(within(dialog).getByRole('button', { name: 'Показать ещё' }))
    expect(authors(dialog)).toHaveLength(10)
    await user.click(within(dialog).getByRole('button', { name: 'Показать ещё' }))
    expect(authors(dialog)).toHaveLength(12)
    expect(within(dialog).queryByRole('button', { name: 'Показать ещё' })).toBeNull()
  })

  it('heads the dialog with "Отзывы", the hotel and its city and a cross, and no "Закрыть" at the bottom', async () => {
    const user = userEvent.setup()
    const dialog = await open(user)
    expect(within(dialog).getByRole('heading', { name: 'Отзывы' })).toBeDefined()
    expect(within(dialog).getByText('Old Town Lantern, Прага')).toBeDefined()
    const close = within(dialog).getAllByRole('button', { name: 'Закрыть' })
    expect(close).toHaveLength(1)
    expect(close[0].textContent).toBe('Закрыть')
    expect(close[0].querySelector('svg')).not.toBeNull()
  })

  it('shows a review: the score, its word, the author, the month and year, the good and the bad', async () => {
    const user = userEvent.setup()
    const dialog = await open(user, {
      ...hotel,
      reviews: [
        { id: 'a', author: 'Анна К.', date: '2026-09-14', score: 9.2, pros: 'Чисто', cons: 'Шумно', helpful: 3 },
      ],
    })
    const review = within(dialog).getByRole('article')
    for (const text of [
      '9,2',
      'Превосходно',
      'Анна К.',
      'сентябрь 2026 г.',
      'Что было хорошо',
      'Чисто',
      'Что было плохо',
      'Шумно',
    ])
      expect(within(review).getByText(text)).toBeDefined()
    expect(within(review).getByText('Что было хорошо').className).toMatch(/\btext-success-foreground\b/)
    expect(within(review).getByText('Что было плохо').className).toMatch(/\btext-destructive\b/)
    expect(within(review).getAllByRole('separator', { hidden: true })).toHaveLength(1)
  })

  it('leaves out «Что было плохо» without the bad and parts the reviews with lines', async () => {
    const user = userEvent.setup()
    const dialog = await open(user)
    const items = within(within(dialog).getByRole('list', { name: 'Отзывы гостей' })).getAllByRole('listitem')
    expect(items).toHaveLength(5)
    // Sorted by usefulness: helpful 11 (no bad) first.
    expect(within(items[0]).queryByText('Что было плохо')).toBeNull()
    expect(within(items[1]).getByText('Что было плохо')).toBeDefined()
    // A line between the reviews, none above the first.
    expect(items[0].querySelector(':scope > [data-slot="separator"]')).toBeNull()
    for (const item of items.slice(1)) expect(item.querySelector(':scope > [data-slot="separator"]')).not.toBeNull()
  })

  it('sorts by usefulness first, then as picked, and a new order starts again from 5', async () => {
    const user = userEvent.setup()
    const dialog = await open(user, {
      ...hotel,
      reviews: reviews.map((r, i) => ({ ...r, score: [7, 9.5, 4.2, 8, 6][i % 5] })),
    })
    const sort = within(dialog).getByLabelText('Сортировка отзывов')
    expect(
      within(sort)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Сначала полезные', 'Сначала новые', 'Сначала с высокой оценкой', 'Сначала с низкой оценкой'])
    expect(authors(dialog).slice(0, 2)).toEqual(['Автор 11', 'Автор 10'])

    await user.click(within(dialog).getByRole('button', { name: 'Показать ещё' }))
    await user.selectOptions(sort, 'Сначала с низкой оценкой')
    expect(authors(dialog)).toHaveLength(5)
    // 4,2 is the score of reviews 2 and 7; the newer first.
    expect(authors(dialog).slice(0, 2)).toEqual(['Автор 7', 'Автор 2'])

    await user.selectOptions(sort, 'Сначала с высокой оценкой')
    expect(authors(dialog).slice(0, 2)).toEqual(['Автор 11', 'Автор 6'])
    await user.selectOptions(sort, 'Сначала новые')
    expect(authors(dialog)[0]).toBe('Автор 11')
  })

  it('closes with Escape and the cross, returning focus to the button, and starts again from 5', async () => {
    const user = userEvent.setup()
    render(<ReviewsDialog hotel={{ ...hotel, reviewCount: 1323 }} />)
    const button = screen.getByRole('button', { name: /^Читать отзывы \(1\s323\)$/ })

    await user.click(button)
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(button)

    await user.click(button)
    expect(authors(screen.getByRole('dialog'))).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(button)
  })
})

// hotel-page, Requirement: Отзывы (Развернуть отзыв)
describe('ReviewsDialog folding', () => {
  const long = 'Очень длинный отзыв. '.repeat(30)
  // jsdom has no layout: a folded body is "taller than six lines" when its text is long.
  const scrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')!
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollHeight', {
      configurable: true,
      get(this: Element) {
        return this.hasAttribute('data-review-body') && (this.textContent ?? '').length > 200 ? 400 : 0
      },
    })
  })
  afterEach(() => Object.defineProperty(Element.prototype, 'scrollHeight', scrollHeight))

  it('folds a text longer than six lines and unfolds it with "Развернуть отзыв"', async () => {
    const user = userEvent.setup()
    const dialog = await open(user, {
      ...hotel,
      reviews: [
        { id: 'long', author: 'Автор длинный', date: '2026-09-14', score: 8, pros: long, helpful: 5 },
        { id: 'short', author: 'Автор короткий', date: '2026-09-13', score: 8, pros: 'Коротко', helpful: 1 },
      ],
    })
    const [longReview, shortReview] = within(dialog).getAllByRole('article')
    expect(within(shortReview).queryByRole('button', { name: /Развернуть|Свернуть/ })).toBeNull()

    const toggle = within(longReview).getByRole('button', { name: 'Развернуть отзыв' })
    const body = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(body.className).toMatch(/\bline-clamp-6\b/)
    expect(body.className).toMatch(/\bmask-b-from-/)

    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.textContent).toBe('Свернуть')
    expect(body.className).not.toMatch(/\bline-clamp-6\b/)

    await user.click(toggle)
    expect(toggle.textContent).toBe('Развернуть отзыв')
    expect(body.className).toMatch(/\bline-clamp-6\b/)
  })
})

// hotel-page, Requirement: Отзывы (фото гостей)
describe('ReviewsDialog guest photos', () => {
  it('shows «Фото гостей • N», and a photo opens the mosaic on the guests tab; "Назад" closes it', async () => {
    const user = userEvent.setup()
    const shown = { ...hotel, guestPhotos: lantern.photos.slice(0, 4).map((p, i) => ({ ...p, id: `g${i}` })) }
    const dialog = await open(user, shown)
    expect(within(dialog).getByRole('heading', { name: 'Фото гостей • 4' })).toBeDefined()
    await user.click(within(dialog).getByRole('button', { name: /^Фото гостя 3:/ }))

    const mosaic = screen.getByRole('dialog', { name: /фотографии$/ })
    const guests = within(mosaic).getByRole('tab', { name: 'Фотографии гостей • 4' })
    expect(guests.getAttribute('aria-selected')).toBe('true')
    // The dialog moves focus after it opens, which can lag behind the click on a slow runner.
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('aria-label')).toBe(
        `Открыть фото 3: ${shown.guestPhotos[2].caption}`,
      ),
    )

    window.history.back()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /фотографии$/ })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Отзывы' })).toBeDefined()
  })

  it('has no strip without guest photos', async () => {
    const user = userEvent.setup()
    const dialog = await open(user, { ...hotel, guestPhotos: [] })
    expect(within(dialog).queryByText(/^Фото гостей/)).toBeNull()
  })
})
