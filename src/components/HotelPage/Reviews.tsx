'use client'

import { useId, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, MessageSquareText, X } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import { Separator } from '@/components/ui/separator'
import { getDestination, type Hotel, type Review } from '@/lib/catalog'
import { fromIso, monthTitle } from '../../lib/dates'
import { ratingLabel, REVIEW_ORDERS, sortReviews, type ReviewOrder } from '../../lib/reviews'
import { DialogButton } from './DialogButton'
import { PhotoMosaic, type MosaicStart } from './PhotoMosaic'
import { formatCount } from './reviewsLabel'
import { ScoreBadge } from './ScoreBadge'
import { useHistoryDialog } from './useHistoryDialog'

const PAGE = 5

type Props = { hotel: Pick<Hotel, 'name' | 'destinationId' | 'reviewCount' | 'reviews' | 'photos' | 'guestPhotos'> }

/**
 * "Читать отзывы (N)": the dialog with the hotel and its city, the strip of the guests' photos (each
 * opens the mosaic at itself), «Сортировка отзывов» and the reviews, five at a time.
 */
export function ReviewsDialog({ hotel }: Props) {
  const { name, destinationId, reviewCount, reviews, guestPhotos } = hotel
  const [visible, setVisible] = useState(PAGE)
  const [order, setOrder] = useState<ReviewOrder>('helpful')
  const mosaic = useHistoryDialog<MosaicStart>()
  const sortId = useId()
  const city = getDestination(destinationId)?.name

  return (
    <Dialog onOpenChange={(open) => open && setVisible(PAGE)}>
      <DialogButton icon={MessageSquareText}>Читать отзывы ({formatCount(reviewCount)})</DialogButton>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 text-base sm:max-w-2xl"
      >
        <div className="flex items-start gap-2 px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogTitle className="text-heading font-bold">Отзывы</DialogTitle>
            <DialogDescription className="text-base">{[name, city].filter(Boolean).join(', ')}</DialogDescription>
          </div>
          <DialogClose render={<Button variant="ghost" size="icon" className="-mt-1 -mr-2 shrink-0" />}>
            <X aria-hidden />
            <span className="sr-only">Закрыть</span>
          </DialogClose>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
          {guestPhotos.length > 0 && (
            <section aria-labelledby={`${sortId}-photos`} className="flex flex-col gap-2">
              <h3 id={`${sortId}-photos`} className="font-bold">
                Фото гостей • {guestPhotos.length}
              </h3>
              <ul className="-mx-4 flex gap-2 overflow-x-auto scroll-px-4 px-4 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
                {guestPhotos.map((photo, index) => (
                  <li key={photo.id} className="shrink-0">
                    <button
                      type="button"
                      aria-label={`Фото гостя ${index + 1}: ${photo.caption}`}
                      className="block size-20 overflow-hidden rounded-lg"
                      onClick={() => mosaic.open({ tab: 'guests', index })}
                    >
                      <PhotoPlaceholder photo={photo} className="size-full text-xs" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor={sortId} className="text-base font-bold">
              Сортировка отзывов
            </Label>
            <NativeSelect
              id={sortId}
              className="w-full sm:w-80"
              value={order}
              onChange={(event) => {
                setOrder(event.target.value as ReviewOrder)
                setVisible(PAGE)
              }}
            >
              {Object.entries(REVIEW_ORDERS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <ul aria-label="Отзывы гостей" className="flex flex-col gap-4">
            {sortReviews(reviews, order)
              .slice(0, visible)
              .map((review, index) => (
                <li key={review.id} className="flex flex-col gap-4">
                  {index > 0 && <Separator />}
                  <ReviewItem review={review} />
                </li>
              ))}
          </ul>
          {visible < reviews.length && (
            <Button className="self-start" variant="outline" onClick={() => setVisible((n) => n + PAGE)}>
              Показать ещё
            </Button>
          )}
        </div>
        <PhotoMosaic hotel={hotel} start={mosaic.value} onClose={mosaic.close} />
      </DialogContent>
    </Dialog>
  )
}

/**
 * One review: the score and its word, the author and the month, then «Что было хорошо» and «Что было
 * плохо». Text longer than six lines folds, fading at the bottom, under "Развернуть отзыв".
 */
function ReviewItem({ review }: { review: Review }) {
  const { author, date, score, pros, cons } = review
  const bodyId = useId()
  const body = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [long, setLong] = useState(false)

  // Whether the folded text overflows its six lines; measured again as the dialog's width changes.
  useLayoutEffect(() => {
    const element = body.current
    if (!element || expanded) return
    const measure = () => setLong(element.scrollHeight > element.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [expanded])

  return (
    <article className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <ScoreBadge score={score} className="size-10 text-base" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
          <span className="font-bold">{ratingLabel(score)}</span>
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{author}</span>
            <Separator orientation="vertical" className="h-4 self-center" />
            <span>{monthTitle.format(fromIso(date))}</span>
          </span>
        </div>
      </div>
      <div
        ref={body}
        id={bodyId}
        data-review-body
        className={cn(!expanded && 'line-clamp-6', !expanded && long && 'mask-b-from-40%')}
      >
        <h4 className="font-bold text-success-foreground">Что было хорошо</h4>
        <p>{pros}</p>
        {cons && (
          <>
            <h4 className="mt-2 font-bold text-destructive">Что было плохо</h4>
            <p>{cons}</p>
          </>
        )}
      </div>
      {long && (
        <Button
          variant="link"
          className="h-auto self-start p-0 text-base"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? 'Свернуть' : 'Развернуть отзыв'}
          {expanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
        </Button>
      )}
    </article>
  )
}
