'use client'

import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import { roomFacts, type Hotel, type Room } from '@/lib/catalog'
import { nightsBetween } from '../../lib/dates'
import { countRu, formatPrice } from '../../lib/format'
import { ratePrice, unavailableReason } from '../../lib/rates'
import { setStayParams, type Stay } from '../../lib/search'

interface Props {
  hotel: Hotel
  /** `null` until the dates are chosen: prices are per night. */
  stay: Stay | null
  guests: Stay['guests']
  onPickDates: () => void
}

const nightForms: [string, string, string] = ['ночь', 'ночи', 'ночей']

function RoomRow({ hotel, room, stay, guests, onPickDates }: Props & { room: Room }) {
  const price = ratePrice(room.rates[0], stay)
  const reason = unavailableReason(room, guests)
  const nights = stay ? nightsBetween(stay.checkIn, stay.checkOut) : 0
  const href = stay && `/hotels/${hotel.id}/rooms?${setStayParams(new URLSearchParams(), stay)}#${room.id}`

  return (
    <li className="grid gap-4 border-t border-border pt-4 sm:grid-cols-[12rem_1fr_auto]">
      <PhotoPlaceholder photo={room.photos[0]} kind="room" className="h-32 rounded-md sm:h-full" />
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold">{room.name}</h3>
        <p className="text-sm text-muted-foreground">{roomFacts(room)}</p>
        {reason && <p className="text-sm text-destructive">{reason}</p>}
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
        {reason ? null : href ? (
          <Link className={buttonVariants()} href={href} aria-label={`Выбрать: ${room.name}`}>
            Выбрать
          </Link>
        ) : (
          <Button variant="outline" onClick={onPickDates}>
            Выберите даты
          </Button>
        )}
      </div>
    </li>
  )
}

export function RoomList(props: Props) {
  return (
    <ul className="flex flex-col gap-4" aria-label="Номера">
      {props.hotel.rooms.map((room) => (
        <RoomRow key={room.id} {...props} room={room} />
      ))}
    </ul>
  )
}
