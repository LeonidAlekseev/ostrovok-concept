'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CircleCheck } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { BookingDetails } from '@/components/BookingDetails/BookingDetails'
import { useHotel } from '@/hooks/useHotels'
import { useHydrated } from '@/hooks/useHydrated'
import { useBookings } from '@/hooks/useStore'
import { findBooking } from '@/lib/storage'

function Confirmation() {
  const id = useSearchParams().get('id') ?? ''
  const hydrated = useHydrated()
  const booking = findBooking(useBookings(), id)
  const { hotel } = useHotel(booking?.hotelId)

  // Bookings come from the browser's storage: until hydration "not found" would flash.
  if (!hydrated) return <p className="text-muted-foreground">Загружаем бронирование…</p>

  if (!booking) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-title font-bold tracking-[-0.02em]">Бронирование не найдено</h1>
        <p className="text-muted-foreground">Бронирования хранятся только в том браузере, где они сделаны.</p>
        <Link className={buttonVariants()} href="/trips">
          Мои поездки
        </Link>
      </div>
    )
  }

  return (
    <>
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-2 font-semibold text-success-foreground">
          <CircleCheck className="size-6" aria-hidden />
          {booking.status === 'cancelled' ? 'Бронирование отменено' : 'Бронирование подтверждено'}
        </p>
        <h1 className="text-title font-bold tracking-[-0.02em]">Номер бронирования {booking.id}</h1>
      </header>
      <BookingDetails booking={booking} hotel={hotel} cancellationTerm="Отмена" />
      <p className="rounded-lg bg-muted p-4 text-sm">
        Бронирование демонстрационное: оно хранится только в этом браузере, деньги не списывались, письмо не
        отправлялось.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link className={buttonVariants()} href="/trips">
          Мои поездки
        </Link>
        <Link className={buttonVariants({ variant: 'outline' })} href="/">
          На главную
        </Link>
      </div>
    </>
  )
}

/** `/booking/confirmation?id=`: the booking comes from the browser's storage. */
export function ConfirmationPage() {
  return (
    <main className="mx-auto flex w-full max-w-(--page-max) flex-1 flex-col gap-6 px-(--page-x) py-[clamp(20px,5vw,40px)]">
      <Suspense fallback={<p className="text-muted-foreground">Загружаем бронирование…</p>}>
        <Confirmation />
      </Suspense>
    </main>
  )
}
