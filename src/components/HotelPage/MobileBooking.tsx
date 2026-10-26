'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from 'cn'
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
 * While the bar hangs over the content it has a white card background and shadow; once it reaches its place above the footer, they fade out.
 */
export function MobileBooking({ hotel }: { hotel: Hotel }) {
  const { stay } = useHotelStay()
  const { guru } = useStayPrice(hotel)
  const [open, setOpen] = useState(false)
  // The panel closing over "Забронировать" hands focus to the rooms rather than back to this button.
  const toRooms = useRef(false)
  const [atRest, setAtRest] = useState(false)
  const restMark = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const mark = restMark.current
    if (!mark || typeof IntersectionObserver === 'undefined') return
    // The mark follows the bar in the flow, so it is in view only once the bar has stopped sticking and sits in its place.
    const observer = new IntersectionObserver(([entry]) => setAtRest(entry.isIntersecting))
    observer.observe(mark)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div
        className={cn(
          'sticky bottom-0 z-20 -mx-(--page-x) mt-auto px-(--page-x) pt-3 pb-[max(12px,env(safe-area-inset-bottom))] transition-[background-color,box-shadow] duration-300 motion-reduce:transition-none lg:hidden',
          atRest ? 'bg-transparent shadow-none' : 'bg-card shadow-(--shadow-card)',
        )}
      >
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
      <span ref={restMark} aria-hidden className="block h-0" />
    </>
  )
}
