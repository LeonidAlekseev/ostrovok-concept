'use client'

import { useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { Hotel } from '@/lib/catalog'
import { formatLongDate } from '../../lib/dates'
import { ratingLabel } from '../../lib/reviews'
import { DialogButton } from './DialogButton'
import { formatCount, reviewsLabel } from './reviewsLabel'
import { ScoreBadge } from './ScoreBadge'

const PAGE = 5

type Props = Pick<Hotel, 'rating' | 'reviewCount' | 'reviews'>

/** "Читать отзывы (N)": the rating summary and the reviews, five at a time, in a dialog. */
export function ReviewsDialog({ rating, reviewCount, reviews }: Props) {
  const [visible, setVisible] = useState(PAGE)

  return (
    <Dialog onOpenChange={(open) => open && setVisible(PAGE)}>
      <DialogButton icon={MessageSquareText}>Читать отзывы ({formatCount(reviewCount)})</DialogButton>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 text-base sm:max-w-2xl"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
          <DialogTitle className="text-heading font-bold">Отзывы</DialogTitle>
          <div className="flex items-center gap-3">
            <ScoreBadge score={rating} />
            <div className="flex flex-col">
              <span className="text-lg/tight font-bold">{ratingLabel(rating)}</span>
              <span className="text-muted-foreground">{reviewsLabel(reviewCount)}</span>
            </div>
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
        </div>
        <div className="flex justify-end border-t p-4">
          <DialogClose render={<Button variant="outline" />}>Закрыть</DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}
