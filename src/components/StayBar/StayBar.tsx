'use client'

import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateField } from '../SearchForm/DateField'
import { GuestsField } from '../SearchForm/GuestsField'
import type { StayState } from './useStay'

/** Dates and guests of the hotel pages; without dates a single "Выберите даты" starts them. */
export function StayBar({ state }: { state: StayState }) {
  const { stay, error, guests, setStay } = state
  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Даты и гости">
      {stay ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <DateField
            checkIn={stay.checkIn}
            checkOut={stay.checkOut}
            onChange={(checkIn, checkOut) => setStay({ checkIn, checkOut })}
          />
          <GuestsField value={guests} onChange={(next) => setStay({ guests: next })} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={() => setStay({})}>
            <CalendarDays aria-hidden />
            Выберите даты
          </Button>
          <p className="text-muted-foreground">Без дат цены показаны за ночь.</p>
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
