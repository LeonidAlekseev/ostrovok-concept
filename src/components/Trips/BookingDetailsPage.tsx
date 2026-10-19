'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { buttonVariants, Button } from '@/components/ui/button'
import { useBookings } from '@/hooks/useStore'
import { cancellationLabel } from '@/lib/booking'
import { findRate, findRoom, getHotel, MEAL_LABEL } from '@/lib/catalog'
import { formatDateRange, formatLongDate, nightsBetween, todayIso } from '@/lib/dates'
import { countRu, formatPrice, guestsLabel } from '@/lib/format'
import { findBooking, type Booking } from '@/lib/storage'
import { feeLabel, STATUS_LABEL, tripTab } from '@/lib/trips'
import { CancelDialog } from './CancelDialog'
import { EditForm } from './EditForm'
import { pageClass, TripsGate } from './TripsGate'

const nightForms: [string, string, string] = ['ночь', 'ночи', 'ночей']

function Details({ booking }: { booking: Booking }) {
  const hotel = getHotel(booking.hotelId)
  const room = hotel && findRoom(hotel, booking.roomId)
  const rate = room && findRate(room, booking.rateId)
  const tab = tripTab(booking, todayIso())
  const rows: [string, string][] = [
    ['Номер бронирования', booking.id],
    ['Создано', formatLongDate(booking.createdAt.slice(0, 10))],
    ['Статус', STATUS_LABEL[tab]],
  ]
  if (booking.cancelledAt) {
    rows.push(['Отменено', formatLongDate(booking.cancelledAt.slice(0, 10))])
    rows.push(['Удержано при отмене', formatPrice(booking.cancellationFee ?? 0)])
  }
  rows.push(
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
    ['Условия отмены', cancellationLabel(booking.cancellation, booking.checkIn)],
  )
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
