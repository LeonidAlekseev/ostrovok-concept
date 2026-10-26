import type { CSSProperties } from 'react'
import type { Hotel, SectionScore } from '@/lib/catalog'
import { REVIEW_SOURCE_LABEL, type HotelDetails, type SourceScores } from '@/lib/hotelDetails'
import { formatDecimal } from '../../lib/format'
import { ratingLabel, scoreColor } from '../../lib/reviews'
import { ReviewsDialog } from './Reviews'
import { basedOnLabel, ownLanguageLabel, reviewsLabel } from './reviewsLabel'
import { ScoreBadge } from './ScoreBadge'

/** The scores of the sections with bars in the colours of the badge's scale. */
function SectionBars({ scores, label }: { scores: SectionScore[]; label: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-[clamp(16px,5vw,48px)] gap-y-3 lg:max-w-3xl" aria-label={label}>
      {scores.map(({ label, score }) => (
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
  )
}

/** «Островок: 7,7 из 10, 9 отзывов» and the source's scores of the sections. */
function SourceBlock({ scores }: { scores: SourceScores }) {
  const name = REVIEW_SOURCE_LABEL[scores.source]
  const line = [
    scores.rating !== null && `${formatDecimal(scores.rating)} из ${scores.scale}`,
    scores.reviewCount > 0 && reviewsLabel(scores.reviewCount),
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-bold">
        {name}
        {line && <span className="font-normal text-muted-foreground"> · {line}</span>}
      </h3>
      {scores.sections.length > 0 && <SectionBars scores={scores.sections} label={`Оценки по разделам: ${name}`} />}
    </div>
  )
}

/** «Вид в отзывах гостей»: the guests' sentences about the view, word for word, with the author and the source. */
function ViewQuotes({ quotes }: { quotes: HotelDetails['viewQuotes'] }) {
  return (
    <section aria-labelledby="view-quotes-title" className="flex flex-col gap-3">
      <h3 id="view-quotes-title" className="font-bold">
        Вид в отзывах гостей
      </h3>
      <ul className="flex flex-col gap-3 lg:max-w-3xl">
        {quotes.map((quote) => (
          <li key={`${quote.reviewId}-${quote.text}`}>
            <figure className="flex flex-col gap-1 border-l-2 border-primary/40 pl-3">
              <blockquote className="text-pretty">«{quote.text}»</blockquote>
              <figcaption className="text-sm text-muted-foreground">
                {quote.author} · {REVIEW_SOURCE_LABEL[quote.source]}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * "Отзывы гостей", the guests' rating: the badge, its word and the counts, the scores of the eight sections with
 * bars in the colours of the same scale, and the reviews dialog. A real hotel's page gives the scores by source
 * (Островок, TripAdvisor), its reviews with their sources and the guests' words about the view.
 */
export function HotelRating({ hotel, details }: { hotel: Hotel; details?: HotelDetails | null }) {
  const { rating, reviewCount, sectionScores } = hotel
  const reviews = details ? details.reviews : hotel.reviews
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
            <span className="text-sm text-pretty text-muted-foreground">
              {ownLanguageLabel(details ? reviews.length : reviewCount)}
            </span>
          )}
        </div>
      </div>
      {details
        ? details.scores.map((scores) => <SourceBlock key={scores.source} scores={scores} />)
        : sectionScores.length > 0 && <SectionBars scores={sectionScores} label="Оценки по разделам" />}
      {details && details.viewQuotes.length > 0 && <ViewQuotes quotes={details.viewQuotes} />}
      {reviews.length > 0 ? (
        <ReviewsDialog hotel={{ ...hotel, reviews, reviewCount: details ? reviews.length : reviewCount }} />
      ) : (
        <p className="text-muted-foreground">Отзывы появятся позже</p>
      )}
    </section>
  )
}
