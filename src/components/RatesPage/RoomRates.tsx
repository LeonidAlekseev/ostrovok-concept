'use client'

import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import { cancellationLabel, effectiveCancellation } from '@/lib/booking'
import { MEAL_LABEL, PAYMENT_LABEL, roomFacts, type Hotel, type Rate, type Room } from '@/lib/catalog'
import { nightsBetween, todayIso } from '../../lib/dates'
import { countRu, formatPrice } from '../../lib/format'
import { toOfferParams } from '../../lib/offer'
import { ratePrice, unavailableReason } from '../../lib/rates'
import type { Guests, Stay } from '../../lib/search'

const nightForms: [string, string, string] = ['ночь', 'ночи', 'ночей']
const cancellationText = (rate: Rate, stay: Stay | null) =>
  stay
    ? cancellationLabel(effectiveCancellation(rate, stay.checkIn, todayIso()), stay.checkIn, { short: true })
    : cancellationLabel(rate.cancellation, null)

interface Props {
  hotel: Hotel
  room: Room
  stay: Stay | null
  guests: Guests
  onPickDates: () => void
}

export function RoomRates({ hotel, room, stay, guests, onPickDates }: Props) {
  const reason = unavailableReason(room, guests)
  const nights = stay ? nightsBetween(stay.checkIn, stay.checkOut) : 0

  return (
    <section id={room.id} aria-labelledby={`${room.id}-title`} className="flex scroll-mt-24 flex-col gap-3">
      <div className="flex items-center gap-4">
        <PhotoPlaceholder photo={room.photos[0]} kind="room" className="h-20 w-36 shrink-0 rounded-md" />
        <div>
          <h2 id={`${room.id}-title`} className="text-heading font-bold">
            {room.name}
          </h2>
          <p className="text-sm text-muted-foreground">{roomFacts(room)}</p>
          {reason && <p className="text-sm font-semibold text-destructive">Недоступен: {reason}</p>}
        </div>
      </div>
      <ul
        className={reason ? 'flex flex-col gap-2 opacity-60' : 'flex flex-col gap-2'}
        aria-label={`Тарифы: ${room.name}`}
      >
        {room.rates.map((rate) => {
          const price = ratePrice(rate, stay)
          return (
            <li
              key={rate.id}
              className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div className="flex flex-col gap-0.5">
                <p className="font-semibold">{MEAL_LABEL[rate.meal]}</p>
                <p className="text-sm">{cancellationText(rate, stay)}</p>
                <p className="text-sm text-muted-foreground">{PAYMENT_LABEL[rate.payment]}</p>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end sm:text-right">
                <p>
                  <b className="text-lg">{formatPrice(price.total ?? price.perNight)}</b>
                  <span className="block text-sm text-muted-foreground">
                    {price.total === null
                      ? 'за ночь'
                      : `за ${countRu(nights, nightForms)} · ${formatPrice(price.perNight)} за ночь`}
                  </span>
                </p>
                {reason ? null : stay ? (
                  <Link
                    className={buttonVariants()}
                    href={`/booking?${toOfferParams({ hotelId: hotel.id, roomId: room.id, rateId: rate.id, ...stay })}`}
                  >
                    Забронировать
                  </Link>
                ) : (
                  <Button variant="outline" onClick={onPickDates}>
                    Выберите даты
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
