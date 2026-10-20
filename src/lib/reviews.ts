import type { Review } from './catalog'

const BUCKETS = [
  { label: 'Великолепно', min: 9 },
  { label: 'Очень хорошо', min: 7 },
  { label: 'Нормально', min: 5 },
  { label: 'Ниже ожиданий', min: 3 },
  { label: 'Плохо', min: 1 },
]

const RATING_LABELS = [
  { label: 'Превосходно', min: 9 },
  { label: 'Отлично', min: 8 },
  { label: 'Очень хорошо', min: 7 },
  { label: 'Хорошо', min: 6 },
]

/** The word for a guest rating: 9+ «Превосходно», 8+ «Отлично», 7+ «Очень хорошо», 6+ «Хорошо», below «Неплохо». */
export const ratingLabel = (rating: number) => RATING_LABELS.find(({ min }) => rating >= min)?.label ?? 'Неплохо'

/** Shares of the sample's reviews per score bucket, in percent. */
export function scoreDistribution(reviews: Review[]) {
  return BUCKETS.map(({ label, min }, i) => {
    const max = i === 0 ? 10 : BUCKETS[i - 1].min - 1
    const count = reviews.filter((r) => r.score >= min && r.score <= max).length
    return {
      label,
      range: min === max ? `${min}` : `${min}–${max}`,
      count,
      share: Math.round((count / reviews.length) * 100),
    }
  })
}
