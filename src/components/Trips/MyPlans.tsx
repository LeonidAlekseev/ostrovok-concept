'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { deleteTripPlan } from '@/app/trip/actions'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { formatDateRange } from '@/lib/dates'
import { countRu, formatPrice } from '@/lib/format'
import { tripPath, type TripSummary } from '@/lib/trip'

const nightForms: [string, string, string] = ['ночь', 'ночи', 'ночей']

function DeletePlan({ plan }: { plan: TripSummary }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const remove = () =>
    startTransition(async () => {
      const result = await deleteTripPlan(plan.id)
      if (result.error) setError(result.error)
      else setOpen(false)
    })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" aria-label={`Удалить план «${plan.title}»`} />}>
        Удалить
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить план «{plan.title}»?</DialogTitle>
          <DialogDescription>Правки плана пропадут; исходный маршрут останется.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Оставить</DialogClose>
          <Button variant="destructive" disabled={pending} onClick={remove}>
            Удалить план
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** «Мои планы»: the user's copies of routes with the city, dates and price; open or delete (after a question). */
export function MyPlans({ plans }: { plans: TripSummary[] | null }) {
  return (
    <section aria-labelledby="my-plans" className="flex flex-col gap-3">
      <h2 id="my-plans" className="text-heading font-bold">
        Мои планы
      </h2>
      {plans === null ? (
        <p role="alert">Не удалось загрузить планы, обновите страницу.</p>
      ) : plans.length === 0 ? (
        <p className="text-muted-foreground">
          Планов пока нет: откройте готовый маршрут и нажмите «Повторить маршрут».
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {plans.map((plan) => (
            <li
              key={plan.id}
              data-testid="plan-card"
              className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-(--shadow-card)"
            >
              <div className="flex flex-col gap-0.5">
                <h3 className="text-lg font-bold">{plan.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {plan.city && `${plan.city} · `}
                  {formatDateRange(plan.start, plan.end)} · {countRu(plan.nights, nightForms)}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">{formatPrice(plan.main)}</span> основные
                  {plan.extras > 0 && <> · {formatPrice(plan.extras)} доп. услуги</>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link className={buttonVariants()} href={tripPath(plan.id)}>
                  Открыть
                </Link>
                <DeletePlan plan={plan} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
