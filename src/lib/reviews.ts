const RATING_LABELS = [
  { label: 'Превосходно', min: 9 },
  { label: 'Отлично', min: 8 },
  { label: 'Очень хорошо', min: 7 },
  { label: 'Хорошо', min: 6 },
]

/** The word for a guest rating: 9+ «Превосходно», 8+ «Отлично», 7+ «Очень хорошо», 6+ «Хорошо», below «Неплохо». */
export const ratingLabel = (rating: number) => RATING_LABELS.find(({ min }) => rating >= min)?.label ?? 'Неплохо'

/** The stops of the score scale and their colours, the `--score-*` tokens of globals.css. */
export const SCORE_STOPS = [
  { score: 5, color: '--score-low' },
  { score: 7, color: '--score-mid' },
  { score: 9, color: '--score-high' },
] as const

/**
 * The colour of a score, a CSS value: red at 5 and below, yellow at 7, green at 9 and above, mixed
 * evenly in between. The badge and the bars of the section scores share it.
 */
export function scoreColor(score: number): string {
  const [low, mid, high] = SCORE_STOPS
  if (score <= low.score) return `var(${low.color})`
  if (score >= high.score) return `var(${high.color})`
  const [from, to] = score < mid.score ? [low, mid] : [mid, high]
  const share = Math.round(((score - from.score) / (to.score - from.score)) * 100)
  return `color-mix(in srgb, var(${from.color}), var(${to.color}) ${share}%)`
}

/**
 * White on the red and the green ends of the scale, dark text on the yellow middle: either way at
 * least 3:1, enough for the large bold figure of the badge (see reviews.test.ts).
 */
export const scoreOnDark = (score: number) => score <= 6 || score >= 8.5
