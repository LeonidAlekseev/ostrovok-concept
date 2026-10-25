'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { formatPrice } from '@/lib/format'
import type { Hotel } from '@/lib/catalog'
import { BookingCard } from './BookingCard'
import { HotelAssistant } from './HotelAssistant'
import { useHotelStay } from './stayContext'
import { useStayPrice } from './useStayPrice'

/**
 * Below `lg` the button stuck to the bottom of the page: "Выбрать даты", with dates "Забронировать · <price>".
 * It opens the booking card with Эвал under it in a panel from the bottom, tall enough for the calendar, which opens downwards, to fit
 * under the days; the card's "Забронировать" closes it at the rooms.
 */
export function MobileBooking({ hotel }: { hotel: Hotel }) {
  const { stay } = useHotelStay()
  const { guru } = useStayPrice(hotel)
  const [open, setOpen] = useState(false)
  // The panel closing over "Забронировать" hands focus to the rooms rather than back to this button.
  const toRooms = useRef(false)

  return (
    <div className="sticky bottom-0 z-20 -mx-(--page-x) mt-auto px-(--page-x) pt-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden">
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (next) toRooms.current = false
          setOpen(next)
        }}
      >
        <SheetTrigger render={<Button size="lg" className="h-12 w-full px-4 text-base shadow-none" />}>
          <span className="min-w-0 truncate">{stay ? `Забронировать · ${formatPrice(guru)}` : 'Выбрать даты'}</span>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="min-h-[min(560px,90svh)] gap-0 overflow-y-auto px-(--page-x) pt-3 pb-[max(16px,env(safe-area-inset-bottom))] text-base"
          finalFocus={() => (toRooms.current ? (document.getElementById('rooms') ?? true) : true)}
        >
          <span className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-muted" aria-hidden />
          <SheetTitle className="sr-only">Бронирование</SheetTitle>
          <BookingCard
            hotel={hotel}
            onBook={() => {
              toRooms.current = true
              setOpen(false)
            }}
          />
          <HotelAssistant className="mt-4 rounded-2xl border p-4" />
        </SheetContent>
      </Sheet>
    </div>
  )
}
