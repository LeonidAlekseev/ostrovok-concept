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

/** A hotel opened from the results map: the hotel page with the dates and guests of the search. */
export function HotelDialog({ hotel, stay, onClose }: Props) {
  const titleId = useId()
  // The last hotel stays in the dialog while it animates out.
  const [last, setLast] = useState(hotel)
  if (hotel && hotel.id !== last?.id) setLast(hotel)
  const shown = hotel ?? last

  return (
    <Dialog open={Boolean(hotel)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        aria-labelledby={titleId}
        className="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-4xl max-sm:inset-0 max-sm:max-h-none max-sm:max-w-none max-sm:translate-0 max-sm:rounded-none"
      >
        {shown && (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto p-[clamp(16px,4vw,32px)] text-base">
              <HotelPage hotel={shown} titleId={titleId} />
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t p-4">
              <DialogClose render={<Button variant="outline" />}>Закрыть</DialogClose>
              <Link
                className={buttonVariants()}
                href={`/hotels/${shown.id}?${setStayParams(new URLSearchParams(), stay)}`}
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
