'use client'

import { useState } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import type { Review } from '@/lib/catalog'
import { formatLongDate } from '../../lib/dates'
import { formatDecimal } from '../../lib/format'
import { scoreDistribution } from '../../lib/reviews'
import { reviewsLabel } from './reviewsLabel'

const PAGE = 5

interface Props {
  rating: number
  reviewCount: number
  reviews: Review[]
  className?: string
}

/** The rating summary and the reviews; the rating of the hotel block leads here (`#reviews`). */
export function Reviews({ rating, reviewCount, reviews, className }: Props) {
  const [visible, setVisible] = useState(PAGE)
  const distribution = scoreDistribution(reviews)

  return (
    <section
      id="reviews"
      tabIndex={-1}
      aria-labelledby="reviews-title"
      className={cn('flex flex-col gap-4', className)}
    >
      <h2 id="reviews-title" className="text-heading font-bold">
        Отзывы
      </h2>
      <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
        <div>
          <p className="text-display leading-none font-bold">{formatDecimal(rating)}</p>
          <p className="mt-2 text-muted-foreground">{reviewsLabel(reviewCount)}</p>
        </div>
        <ul className="flex flex-col gap-1.5" aria-label="Распределение оценок">
          {distribution.map(({ label, range, count, share }) => (
            <li key={label} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-3 text-sm">
              <span>
                {label} <span className="text-muted-foreground">{range}</span>
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span className="block h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
              </span>
              <span className="text-right text-muted-foreground" title={`${count} из ${reviews.length}`}>
                {share}%
              </span>
            </li>
          ))}
        </ul>
      </div>
      <ul className="flex flex-col gap-4">
        {reviews.slice(0, visible).map((review) => (
          <li key={review.id} className="border-t border-border pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">{review.author}</span>
              <span className="text-sm text-muted-foreground">{formatLongDate(review.date)}</span>
            </div>
            <p className="mt-1 text-sm font-semibold text-brand-foreground">Оценка {review.score} из 10</p>
            <p className="mt-2">{review.text}</p>
          </li>
        ))}
      </ul>
      {visible < reviews.length && (
        <Button className="self-start" variant="outline" onClick={() => setVisible((n) => n + PAGE)}>
          Показать ещё
        </Button>
      )}
    </section>
  )
}
