'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CircleCheck } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { useHydrated } from '@/hooks/useHydrated'
import { useBookings } from '@/hooks/useStore'
import { cancellationLabel } from '@/lib/booking'
import { findRate, findRoom, getHotel, MEAL_LABEL } from '@/lib/catalog'
import { formatDateRange, nightsBetween } from '@/lib/dates'
import { countRu, formatPrice, guestsLabel } from '@/lib/format'
import { findBooking, type Booking } from '@/lib/storage'

const nightForms: [string, string, string] = ['ночь', 'ночи', 'ночей']

function Details({ booking }: { booking: Booking }) {
  const hotel = getHotel(booking.hotelId)
  const room = hotel && findRoom(hotel, booking.roomId)
  const rate = room && findRate(room, booking.rateId)
  const rows: [string, string][] = [
    ['Отель', hotel?.name ?? 'Отель'],
    ['Номер', room?.name ?? 'Номер'],
    ['Тариф', rate ? MEAL_LABEL[rate.meal] : 'Тариф'],
    [
      'Даты',
      `${formatDateRange(booking.checkIn, booking.checkOut)}, ${countRu(nightsBetween(booking.checkIn, booking.checkOut), nightForms)}`,
    ],
    ['Гости', guestsLabel(booking.guests)],
    [
      booking.roomGuests.length > 1 ? 'Основные гости' : 'Основной гость',
      booking.roomGuests.map((g) => `${g.firstName} ${g.lastName}`).join(', '),
    ],
    ['Контакты', `${booking.contact.email}, ${booking.contact.phone}`],
    ['Пожелания', booking.requests || 'Нет'],
    ['Оплата', booking.cardLast4 ? `Карта •••• ${booking.cardLast4}` : 'Оплата в отеле при заселении'],
    ['Отмена', cancellationLabel(booking.cancellation, booking.checkIn)],
  ]
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border border-border bg-card p-4 [&_dd]:text-right">
      {rows.map(([term, value]) => (
        <div key={term} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-muted-foreground">{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      <div className="col-span-2 grid grid-cols-subgrid border-t border-border pt-3">
        <dt className="font-semibold">{booking.payment === 'now' ? 'Оплачено' : 'К оплате в отеле'}</dt>
        <dd>
          <b className="text-xl">{formatPrice(booking.total)}</b>
        </dd>
      </div>
    </dl>
  )
}

function Confirmation() {
  const id = useSearchParams().get('id') ?? ''
  const hydrated = useHydrated()
  const booking = findBooking(useBookings(), id)

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
      <Details booking={booking} />
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
