import type { Review } from './catalog'

const RATING_LABELS = [
  { label: 'Превосходно', min: 9 },
  { label: 'Отлично', min: 8 },
  { label: 'Очень хорошо', min: 7 },
  { label: 'Хорошо', min: 6 },
]

/** The word for a guest rating: 9+ «Превосходно», 8+ «Отлично», 7+ «Очень хорошо», 6+ «Хорошо», below «Неплохо». */
export const ratingLabel = (rating: number) => RATING_LABELS.find(({ min }) => rating >= min)?.label ?? 'Неплохо'

/**
 * The stops of the score scale and their colours, the `--score-*` tokens of globals.css. The lime at 8
 * keeps the way from yellow to green bright: mixed straight, 7,5–8 come out olive.
 */
export const SCORE_STOPS = [
  { score: 5, color: '--score-low' },
  { score: 7, color: '--score-mid' },
  { score: 8, color: '--score-good' },
  { score: 9, color: '--score-high' },
] as const

/**
 * The colour of a score, a CSS value: red at 5 and below, yellow at 7, lime at 8, green at 9 and
 * above, mixed in `oklch` in between. The badge and the bars of the section scores share it.
 */
export function scoreColor(score: number): string {
  const first = SCORE_STOPS[0]
  const last = SCORE_STOPS[SCORE_STOPS.length - 1]
  if (score <= first.score) return `var(${first.color})`
  if (score >= last.score) return `var(${last.color})`
  const index = SCORE_STOPS.findIndex((stop) => stop.score > score)
  const [from, to] = [SCORE_STOPS[index - 1], SCORE_STOPS[index]]
  const share = Math.round(((score - from.score) / (to.score - from.score)) * 100)
  return `color-mix(in oklch, var(${from.color}), var(${to.color}) ${share}%)`
}

/**
 * White on the red and the green ends of the scale, dark text from orange to lime: either way at
 * least 3:1, enough for the large bold figure of the badge (see reviews.test.ts).
 */
export const scoreOnDark = (score: number) => score <= 5.7 || score >= 8.8

export const REVIEW_ORDERS = {
  helpful: 'Сначала полезные',
  newest: 'Сначала новые',
  highest: 'Сначала с высокой оценкой',
  lowest: 'Сначала с низкой оценкой',
} as const

export type ReviewOrder = keyof typeof REVIEW_ORDERS

type Sortable = Pick<Review, 'id' | 'date' | 'score' | 'helpful'>

const newestFirst = (a: Sortable, b: Sortable) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)

const ORDER_COMPARE: Record<ReviewOrder, (a: Sortable, b: Sortable) => number> = {
  helpful: (a, b) => b.helpful - a.helpful || newestFirst(a, b),
  newest: newestFirst,
  highest: (a, b) => b.score - a.score || newestFirst(a, b),
  lowest: (a, b) => a.score - b.score || newestFirst(a, b),
}

/** The reviews in one of the orders of «Сортировка отзывов», the newer first among equals. */
export const sortReviews = <T extends Sortable>(reviews: readonly T[], order: ReviewOrder): T[] =>
  [...reviews].sort(ORDER_COMPARE[order])
