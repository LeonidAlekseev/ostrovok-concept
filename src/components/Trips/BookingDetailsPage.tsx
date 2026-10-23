'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { buttonVariants, Button } from '@/components/ui/button'
import { BookingDetails } from '@/components/BookingDetails/BookingDetails'
import { useHotel } from '@/hooks/useHotels'
import { useBookings } from '@/hooks/useStore'
import { formatLongDate, todayIso } from '@/lib/dates'
import { formatPrice } from '@/lib/format'
import { findBooking, type Booking } from '@/lib/storage'
import { feeLabel, STATUS_LABEL, tripTab } from '@/lib/trips'
import { CancelDialog } from './CancelDialog'
import { EditForm } from './EditForm'
import { pageClass, TripsGate } from './TripsGate'

function Details({ booking }: { booking: Booking }) {
  const leadingRows: [string, string][] = [
    ['Номер бронирования', booking.id],
    ['Создано', formatLongDate(booking.createdAt.slice(0, 10))],
    ['Статус', STATUS_LABEL[tripTab(booking, todayIso())]],
  ]
  if (booking.cancelledAt) {
    leadingRows.push(['Отменено', formatLongDate(booking.cancelledAt.slice(0, 10))])
    leadingRows.push(['Удержано при отмене', formatPrice(booking.cancellationFee ?? 0)])
  }
  const { hotel } = useHotel(booking.hotelId)
  return <BookingDetails booking={booking} hotel={hotel} leadingRows={leadingRows} cancellationTerm="Условия отмены" />
}

function BookingView({ booking }: { booking: Booking }) {
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const upcoming = tripTab(booking, todayIso()) === 'upcoming'

  return (
    <>
      <h1 className="text-title font-bold tracking-[-0.02em]">Бронирование {booking.id}</h1>
      {saved && (
        <p role="status" className="rounded-lg bg-success-soft p-3 font-semibold text-success-foreground">
          Изменения сохранены
        </p>
      )}
      {booking.status === 'cancelled' && (
        <p role="status" className="rounded-lg bg-muted p-3">
          Бронирование отменено. {feeLabel(booking.cancellationFee ?? 0)}.
        </p>
      )}
      {editing ? (
        <EditForm
          booking={booking}
          onSaved={() => {
            setEditing(false)
            setSaved(true)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <Details booking={booking} />
      )}
      {upcoming && !editing && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => {
                setSaved(false)
                setEditing(true)
              }}
            >
              Изменить данные
            </Button>
            <CancelDialog booking={booking} />
          </div>
          <p className="text-sm text-muted-foreground">
            Изменить даты нельзя.{' '}
            <Link className="underline" href="/help">
              Напишите в поддержку
            </Link>
            .
          </p>
        </div>
      )}
      <Link className={buttonVariants({ variant: 'outline' }) + ' w-fit'} href="/trips">
        Все поездки
      </Link>
    </>
  )
}

function Content() {
  const id = useSearchParams().get('id') ?? ''
  const booking = findBooking(useBookings(), id)
  return (
    <TripsGate next={`/trips/booking?id=${id}`}>
      {booking ? (
        <BookingView booking={booking} />
      ) : (
        <div className="flex flex-col items-start gap-3">
          <h1 className="text-title font-bold tracking-[-0.02em]">Бронирование не найдено</h1>
          <p className="text-muted-foreground">Бронирования хранятся только в том браузере, где они сделаны.</p>
          <Link className={buttonVariants()} href="/trips">
            Мои поездки
          </Link>
        </div>
      )}
    </TripsGate>
  )
}

/** `/trips/booking?id=`: details, edit and cancel of one booking. */
export function BookingDetailsPage() {
  return (
    <main className={pageClass}>
      <Suspense fallback={<p className="text-muted-foreground">Загружаем бронирование…</p>}>
        <Content />
      </Suspense>
    </main>
  )
}
