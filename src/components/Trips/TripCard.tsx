import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import type { Hotel } from '@/lib/catalog'
import { formatDateRange, nightsBetween } from '@/lib/dates'
import { countRu, formatPrice, guestsLabel } from '@/lib/format'
import type { Booking } from '@/lib/storage'
import { STATUS_LABEL, type TripTab } from '@/lib/trips'

const nightForms: [string, string, string] = ['ночь', 'ночи', 'ночей']

const BADGE = { upcoming: 'success', past: 'secondary', cancelled: 'destructive' } as const

/** A booking in the list; `hotel` is `undefined` when it is gone from the catalogue or failed to load. */
export function TripCard({ booking, hotel, tab }: { booking: Booking; hotel: Hotel | undefined; tab: TripTab }) {
  return (
    <li>
      <Link
        href={`/trips/booking?id=${booking.id}`}
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted sm:flex-row"
      >
        {hotel && <PhotoPlaceholder photo={hotel.photos[0]} className="h-28 rounded-md sm:w-40 sm:shrink-0" />}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-heading font-bold">{hotel?.name ?? 'Отель'}</h3>
            <Badge variant={BADGE[tab]}>{STATUS_LABEL[tab]}</Badge>
          </div>
          <p>
            {formatDateRange(booking.checkIn, booking.checkOut)},{' '}
            {countRu(nightsBetween(booking.checkIn, booking.checkOut), nightForms)}
          </p>
          <p className="text-muted-foreground">{guestsLabel(booking.guests)}</p>
          <p className="text-sm text-muted-foreground">Бронирование {booking.id}</p>
        </div>
        <b className="text-xl sm:self-end">{formatPrice(booking.total)}</b>
      </Link>
    </li>
  )
}
