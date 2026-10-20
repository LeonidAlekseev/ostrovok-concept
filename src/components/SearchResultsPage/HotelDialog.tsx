'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import type { Hotel } from '../../lib/catalog'
import { setStayParams, type Stay } from '../../lib/search'
import { HotelPage } from '../HotelPage/HotelPage'

interface Props {
  /** The hotel to show; `undefined` closes the dialog. */
  hotel: Hotel | undefined
  stay: Stay
  onClose: () => void
}

/** Only the dates and guests of the search query. */
const searchStay = ({ checkIn, checkOut, guests }: Stay): Stay => ({ checkIn, checkOut, guests })

/**
 * A hotel opened from the results map: the hotel page with the dates and guests of the search, its
 * price bar stuck to the bottom of the scrolling area.
 */
export function HotelDialog({ hotel, stay, onClose }: Props) {
  const titleId = useId()
  // The last hotel stays in the dialog while it animates out.
  const [last, setLast] = useState(hotel)
  if (hotel && hotel.id !== last?.id) setLast(hotel)
  const shown = hotel ?? last
  // The dates of the window are its own: they start from the search each time it opens.
  const [local, setLocal] = useState<Stay>(() => searchStay(stay))
  const [wasOpen, setWasOpen] = useState(false)
  if (Boolean(hotel) !== wasOpen) {
    setWasOpen(Boolean(hotel))
    if (hotel) setLocal(searchStay(stay))
  }

  return (
    <Dialog open={Boolean(hotel)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        aria-labelledby={titleId}
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl max-sm:inset-0 max-sm:max-h-none max-sm:max-w-none max-sm:translate-0 max-sm:rounded-none"
      >
        {shown && (
          <>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-(--decor-surface-soft) px-3 pt-3 text-base">
              <HotelPage hotel={shown} titleId={titleId} stay={{ value: local, onChange: setLocal }} />
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t p-4">
              <DialogClose render={<Button variant="outline" />}>Закрыть</DialogClose>
              <Link
                className={buttonVariants()}
                href={`/hotels/${shown.id}?${setStayParams(new URLSearchParams(), local)}`}
              >
                Открыть страницу отеля
              </Link>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
