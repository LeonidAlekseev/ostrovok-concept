'use client'

import { CalendarPlus, Check, LoaderCircle, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatDateRange } from '@/lib/dates'
import { toIcs } from '@/lib/ics'
import { countRu, formatPrice } from '@/lib/format'
import { TRANSFER_LABEL, type RoutePlan } from '@/lib/routes'
import { setStart, tripEvents, type TripData } from '@/lib/trip'
import { DateField } from '../SearchForm/DateField'
import type { SaveStatus } from './useAutosave'

const nightForms: [string, string, string] = ['ночь', 'ночи', 'ночей']

/** Downloads the plan as `opognali-<id>.ics`: the phone or computer offers to add it to the calendar. */
function downloadPlan(tripId: string, trip: TripData, plan: RoutePlan) {
  const text = toIcs(trip.route.title, tripEvents(tripId, trip, plan), new Date())
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `opognali-${tripId}.ics`
  link.click()
  URL.revokeObjectURL(url)
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold whitespace-nowrap">{value ? formatPrice(value) : 'бесплатно'}</dd>
    </div>
  )
}

function SaveState({ status, error, onRetry }: { status: SaveStatus; error: string | null; onRetry: () => void }) {
  return (
    <div aria-live="polite" className="flex min-h-9 flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {status === 'saved' && (
        <>
          <Check aria-hidden className="size-4 text-primary" /> Сохранено
        </>
      )}
      {status === 'saving' && (
        <>
          <LoaderCircle aria-hidden className="size-4 animate-spin" /> Сохраняем…
        </>
      )}
      {status === 'error' && (
        <>
          <TriangleAlert aria-hidden className="size-4 text-destructive" />
          <span role="alert">{error ?? 'Не удалось сохранить план'}</span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Повторить
          </Button>
        </>
      )}
    </div>
  )
}

interface Props {
  tripId: string
  trip: TripData
  plan: RoutePlan
  save: { status: SaveStatus; error: string | null; retry: () => void }
  onEdit: (edit: (trip: TripData) => TripData) => void
}

/**
 * The dates and the exact price of the plan, one room for two adults: main costs (hotels, transfers, the rented
 * car) and, apart, extra services (leisure); the start date, the calendar export and whether the edits are saved.
 */
export function TripSummary({ tripId, trip, plan, save, onEdit }: Props) {
  const transfers = plan.days.flatMap((day) => day.items.flatMap((item) => (item.kind === 'transfer' ? item : [])))
  const leisure = plan.days.flatMap((day) => day.items.flatMap((item) => (item.kind === 'leisure' ? item : [])))
  const nights = countRu(plan.nights, nightForms)
  return (
    <section
      aria-labelledby="trip-price"
      className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-(--shadow-card)"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="trip-price" className="text-heading font-bold">
            Даты и цена
          </h2>
          <p data-testid="trip-dates" className="font-semibold">
            {formatDateRange(plan.start, plan.end)} · {nights}
          </p>
        </div>
        <DateField
          single
          checkIn={trip.start}
          checkOut={trip.start}
          trigger={
            <Button variant="outline" size="sm" aria-label="Изменить дату начала">
              Изменить
            </Button>
          }
          onChange={(start) => onEdit((t) => setStart(t, start))}
        />
      </div>
      <p className="text-sm text-muted-foreground">Один номер, 2 взрослых; выходные ночи дороже.</p>
      <dl aria-label="Основные" className="flex flex-col gap-1.5">
        {plan.stays.map((stay) => (
          <Row key={stay.stop} label={`${stay.hotel.name}, ${countRu(stay.nights, nightForms)}`} value={stay.price} />
        ))}
        {transfers
          .filter((item) => item.mode !== 'car')
          .map((item) => (
            <Row key={item.leg} label={`${TRANSFER_LABEL[item.mode]}: ${item.from} → ${item.to}`} value={item.price} />
          ))}
        {plan.carRental && (
          <Row
            label={`Аренда машины, ${countRu(plan.carRental.days, ['сутки', 'суток', 'суток'])}`}
            value={plan.carRental.price}
          />
        )}
        <div className="flex justify-between gap-3 pt-1 text-lg font-bold">
          <dt>Основные</dt>
          <dd data-testid="trip-main" className="text-right whitespace-nowrap">
            {formatPrice(plan.main)}
          </dd>
        </div>
      </dl>
      <Separator />
      <dl aria-label="Доп. услуги" className="flex flex-col gap-1.5">
        {leisure.map((item) => (
          <Row key={item.leisure.id ?? item.index} label={item.leisure.title} value={item.leisure.price} />
        ))}
        <div className="flex justify-between gap-3 pt-1 font-bold">
          <dt>Доп. услуги</dt>
          <dd data-testid="trip-extras" className="whitespace-nowrap">
            {formatPrice(plan.extras)}
          </dd>
        </div>
        <p className="text-sm text-muted-foreground">Досуг оплачивается отдельно и не входит в основные.</p>
      </dl>
      <Button variant="outline" shape="pill" size="lg" onClick={() => downloadPlan(tripId, trip, plan)}>
        <CalendarPlus aria-hidden /> Добавить в календарь
      </Button>
      <SaveState status={save.status} error={save.error} onRetry={save.retry} />
    </section>
  )
}
