'use client'

import Link from 'next/link'
import { CalendarPlus, Repeat } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatDateRange } from '@/lib/dates'
import { countRu, formatPrice } from '@/lib/format'
import { toIcs } from '@/lib/ics'
import { planEvents, TRANSFER_LABEL, type Route, type RoutePlan } from '@/lib/routes'
import { hotelHref } from './hotelHref'

/** Downloads the plan as `opognali-<id>.ics`: the phone or computer offers to add it to the calendar. */
function downloadPlan(route: Route, plan: RoutePlan) {
  const text = toIcs(route.title, planEvents(route, plan), new Date())
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `opognali-${route.id}.ics`
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

/** The two totals of the plan, main (hotels, transfers, rented car) and extra services (leisure), and the actions. */
export function RouteSummary({ route, plan }: { route: Route; plan: RoutePlan }) {
  const transfers = plan.days.flatMap((day) => day.items.flatMap((item) => (item.kind === 'transfer' ? item : [])))
  const leisure = plan.days.flatMap((day) => day.items.flatMap((item) => (item.kind === 'leisure' ? item : [])))
  const first = plan.stays[0]
  return (
    <section
      aria-labelledby="route-price"
      className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-(--shadow-card)"
    >
      <div className="flex flex-col gap-1">
        <h2 id="route-price" className="text-heading font-bold">
          Цена плана
        </h2>
        <p className="text-sm text-muted-foreground">
          {formatDateRange(plan.start, plan.end)}, {countRu(plan.nights, ['ночь', 'ночи', 'ночей'])}, 2 взрослых
        </p>
      </div>
      <dl aria-label="Основные" className="flex flex-col gap-1.5">
        {plan.stays.map((stay) => (
          <Row
            key={stay.stop}
            label={`${stay.hotel.name}, ${countRu(stay.nights, ['ночь', 'ночи', 'ночей'])}`}
            value={stay.price}
          />
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
          <dd data-testid="route-main" className="whitespace-nowrap">
            {formatPrice(plan.main)}
          </dd>
        </div>
      </dl>
      <Separator />
      <dl aria-label="Доп. услуги" className="flex flex-col gap-1.5">
        {leisure.map((item) => (
          <Row key={item.index} label={item.leisure.title} value={item.leisure.price} />
        ))}
        <div className="flex justify-between gap-3 pt-1 font-bold">
          <dt>Доп. услуги</dt>
          <dd data-testid="route-extras" className="whitespace-nowrap">
            {formatPrice(plan.extras)}
          </dd>
        </div>
        <p className="text-sm text-muted-foreground">Досуг оплачивается отдельно и не входит в основные.</p>
      </dl>
      <div className="flex flex-col gap-2">
        <Link className={buttonVariants({ size: 'lg', shape: 'pill' })} href={hotelHref(first.hotel.id, first)}>
          <Repeat aria-hidden /> Повторить маршрут
        </Link>
        <Button variant="outline" shape="pill" onClick={() => downloadPlan(route, plan)}>
          <CalendarPlus aria-hidden /> Добавить в календарь
        </Button>
      </div>
    </section>
  )
}
