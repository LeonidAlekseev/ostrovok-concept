import { cancellationLabel } from '@/lib/booking'
import { findRate, findRoom, MEAL_LABEL } from '@/lib/catalog'
import { formatDateRange, nightsBetween } from '@/lib/dates'
import { countRu, formatPrice, guestsLabel } from '@/lib/format'
import type { Hotel } from '@/lib/catalog'
import type { Booking } from '@/lib/storage'

const nightForms: [string, string, string] = ['ночь', 'ночи', 'ночей']

interface Props {
  booking: Booking
  /** The booked hotel; `undefined` while it loads or when it is gone from the catalogue. */
  hotel: Hotel | undefined
  /** Rows above the hotel: the booking's number, dates and status. */
  leadingRows?: [string, string][]
  /** The term of the cancellation row, which differs between the pages. */
  cancellationTerm: string
}

/** The details of a booking and its total: the confirmation page and the trip details. */
export function BookingDetails({ booking, hotel, leadingRows = [], cancellationTerm }: Props) {
  const room = hotel && findRoom(hotel, booking.roomId)
  const rate = room && findRate(room, booking.rateId)
  const rows: [string, string][] = [
    ...leadingRows,
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
    [cancellationTerm, cancellationLabel(booking.cancellation, booking.checkIn)],
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
