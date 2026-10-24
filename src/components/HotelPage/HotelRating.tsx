import type { CSSProperties } from 'react'
import type { Hotel } from '@/lib/catalog'
import { formatDecimal } from '../../lib/format'
import { ratingLabel, scoreColor } from '../../lib/reviews'
import { ReviewsDialog } from './Reviews'
import { basedOnLabel, ownLanguageLabel } from './reviewsLabel'
import { ScoreBadge } from './ScoreBadge'

/**
 * "Отзывы гостей", the guests' rating: the badge, its word and the counts, the scores of the eight sections with
 * bars in the colours of the same scale, and the reviews dialog.
 */
export function HotelRating({ hotel }: { hotel: Hotel }) {
  const { rating, reviewCount, sectionScores, reviews } = hotel
  return (
    <section id="rating" tabIndex={-1} aria-labelledby="rating-title" className="flex flex-col gap-5 outline-none">
      <h2 id="rating-title" className="text-heading font-bold">
        Отзывы гостей
      </h2>
      <div className="flex items-center gap-3">
        <ScoreBadge score={rating} />
        <div className="flex min-w-0 flex-col">
          <span className="text-lg/tight font-bold">{ratingLabel(rating)}</span>
          <span className="text-sm text-muted-foreground">{basedOnLabel(reviewCount)}</span>
          {reviews.length > 0 && (
            <span className="text-sm text-pretty text-muted-foreground">{ownLanguageLabel(reviewCount)}</span>
          )}
        </div>
      </div>
      {sectionScores.length > 0 && (
        <ul
          className="grid grid-cols-2 gap-x-[clamp(16px,5vw,48px)] gap-y-3 lg:max-w-3xl"
          aria-label="Оценки по разделам"
        >
          {sectionScores.map(({ label, score }) => (
            <li key={label} className="flex min-w-0 flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0">{label}</span>
                <b>{formatDecimal(score)}</b>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span
                  data-score-bar
                  style={{ '--score': scoreColor(score), width: `${score * 10}%` } as CSSProperties}
                  className="block h-full rounded-full bg-(--score)"
                />
              </span>
            </li>
          ))}
        </ul>
      )}
      {reviews.length > 0 ? (
        <ReviewsDialog hotel={hotel} />
      ) : (
        <p className="text-muted-foreground">Отзывы появятся позже</p>
      )}
    </section>
  )
}
