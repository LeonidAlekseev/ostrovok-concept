'use client'

import { ChevronRight, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Hotel } from '@/lib/catalog'
import { formatShortDay, nightsBetween, type IsoDate } from '../../lib/dates'
import { countRu, guestsLabel } from '../../lib/format'
import { DateField } from '../SearchForm/DateField'
import { GuestsField } from '../SearchForm/GuestsField'
import { useHotelStay } from './stayContext'

const nightForms: [string, string, string] = ['ночь', 'ночи', 'ночей']

function Day({ title, date, time }: { title: string; date: IsoDate; time: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-sm text-muted-foreground">{title}</span>
      <span className="text-xl font-bold">{formatShortDay(date)}</span>
      <span className="text-sm text-muted-foreground">{time}</span>
    </div>
  )
}

/**
 * "Даты проживания": check-in and check-out with the hotel's times, "Изменить" opening the calendar
 * and the guests row opening the guests picker. Without dates, "Выберите даты" stands for the days.
 */
export function StayDates({ hotel }: { hotel: Hotel }) {
  const { stay, error, guests, setStay } = useHotelStay()
  const nights = stay ? nightsBetween(stay.checkIn, stay.checkOut) : 0

  return (
    <section aria-labelledby="stay-title" className="flex flex-col gap-4 rounded-xl bg-card p-4 shadow-(--shadow-card)">
      <div className="flex items-center justify-between gap-3">
        <h3 id="stay-title" className="text-lg font-bold">
          Даты проживания
        </h3>
        <DateField
          checkIn={stay?.checkIn ?? ''}
          checkOut={stay?.checkOut ?? ''}
          onChange={(checkIn, checkOut) => setStay({ checkIn, checkOut })}
          trigger={
            <Button variant="link" className="h-auto px-0 text-base font-semibold">
              Изменить
            </Button>
          }
        />
      </div>
      {stay ? (
        <div className="grid grid-cols-2 gap-4">
          <Day title="Заезд" date={stay.checkIn} time={`с ${hotel.checkInTime}`} />
          <div className="border-l border-border pl-4">
            <Day title="Выезд" date={stay.checkOut} time={`до ${hotel.checkOutTime}`} />
          </div>
        </div>
      ) : (
        <p className="text-xl font-bold">Выберите даты</p>
      )}
      <GuestsField
        value={guests}
        onChange={(next) => setStay({ guests: next })}
        trigger={
          <button
            type="button"
            className="flex w-full items-center gap-3 border-y border-border py-3 text-left font-semibold transition-colors hover:bg-secondary"
          >
            <User className="size-6 shrink-0" strokeWidth={1.8} aria-hidden />
            <span className="min-w-0 flex-1">
              {guestsLabel(guests)}
              {stay && ` · ${countRu(nights, nightForms)}`}
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        }
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
