'use client'

import type { ComponentProps, ReactElement } from 'react'
import { CalendarDays, ChevronDown, ChevronRight, User } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { freeCancellationDeadline, type Hotel } from '@/lib/catalog'
import { formatShortDay, todayIso } from '@/lib/dates'
import { formatPrice, guestsLabel } from '@/lib/format'
import { DateField } from '../SearchForm/DateField'
import { GuestsField } from '../SearchForm/GuestsField'
import { goToSection } from './goToSection'
import { useHotelStay } from './stayContext'
import { useStayPrice } from './useStayPrice'

const field =
  'flex w-full min-w-0 items-center gap-2.5 rounded-lg bg-secondary px-3 py-2 text-left transition-colors hover:bg-muted'

/** A field of the card: an icon, a grey title over the value and the chevron (the days leave it out for room). */
function Field({
  icon: Icon,
  title,
  value,
  className,
  chevron = true,
  ...props
}: ComponentProps<'button'> & { icon: typeof User; title?: string; value: string; chevron?: boolean }) {
  return (
    <button type="button" {...props} className={cn(field, className)}>
      <Icon className="size-5 shrink-0 text-primary" strokeWidth={1.8} aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        {title && <span className="text-xs text-muted-foreground">{title}</span>}
        <span className="truncate font-semibold">{value}</span>
      </span>
      {chevron && <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
    </button>
  )
}

/** A day field opening the calendar of the stay. */
function DayField({ trigger }: { trigger: ReactElement }) {
  const { stay, setStay } = useHotelStay()
  return (
    <DateField
      checkIn={stay?.checkIn ?? ''}
      checkOut={stay?.checkOut ?? ''}
      onChange={(checkIn, checkOut) => setStay({ checkIn, checkOut })}
      trigger={trigger}
    />
  )
}

/**
 * The booking card: the GURU price of the stay with the regular one struck out, "за M ночей для N гостей",
 * check-in, check-out and the guests, each opening its picker, and "Забронировать", which leads to the rooms
 * (`onBook` runs first). Under it the last day of free cancellation of the cheapest refundable rate, only when
 * the dates are chosen and such a rate has it ahead; the time of day is not in the data.
 */
export function BookingCard({ hotel, onBook, className }: { hotel: Hotel; onBook?: () => void; className?: string }) {
  const { stay, error, guests, setStay } = useHotelStay()
  const { price, guru, caption } = useStayPrice(hotel)
  const deadline = stay && freeCancellationDeadline(hotel, stay.checkIn, todayIso())
  const day = (date: string | undefined) => (date ? formatShortDay(date) : 'Выберите')

  return (
    <div role="region" aria-label="Цена" className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[clamp(24px,6vw,28px)]/tight font-bold whitespace-nowrap">
            <span className="sr-only">Цена GURU </span>
            {formatPrice(guru)}
          </span>
          <s className="text-sm whitespace-nowrap text-muted-foreground">
            <span className="sr-only">Обычная цена </span>
            {formatPrice(price)}
          </s>
        </p>
        <p className="text-sm text-muted-foreground">{caption}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DayField
          trigger={
            <Field
              icon={CalendarDays}
              chevron={false}
              title="Заезд"
              value={day(stay?.checkIn)}
              aria-label={`Заезд: ${day(stay?.checkIn)}`}
            />
          }
        />
        <DayField
          trigger={
            <Field
              icon={CalendarDays}
              chevron={false}
              title="Выезд"
              value={day(stay?.checkOut)}
              aria-label={`Выезд: ${day(stay?.checkOut)}`}
            />
          }
        />
      </div>
      <GuestsField
        value={guests}
        onChange={(next) => setStay({ guests: next })}
        trigger={<Field icon={User} value={guestsLabel(guests)} />}
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button
        size="lg"
        className="h-12 w-full text-base shadow-none"
        onClick={() => {
          onBook?.()
          goToSection('rooms')
        }}
      >
        <span className="min-w-0 truncate">Забронировать</span>
        <ChevronRight aria-hidden />
      </Button>
      {deadline && (
        <p className="text-center text-sm text-muted-foreground">Бесплатная отмена до {formatShortDay(deadline)}</p>
      )}
    </div>
  )
}
