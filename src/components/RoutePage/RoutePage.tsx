'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import type { Hotel } from '@/lib/catalog'
import { addDays } from '@/lib/dates'
import { authorName, PERSONA_LABEL, type Route } from '@/lib/routes'
import { RouteMap } from './RouteMap'
import { RouteSummary } from './RouteSummary'
import { RouteTimeline } from './RouteTimeline'
import { useRoutePlan } from './useRoutePlan'

interface Props {
  route: Route
  /** The hotels of the stops by id. */
  hotels: Record<string, Hotel>
}

const NO_EDITS = new URLSearchParams()

function RouteView({ route, hotels, params }: Props & { params: Pick<URLSearchParams, 'get'> }) {
  const { today, state, plan, edit } = useRoutePlan(route, hotels, params)
  return (
    <main className="mx-auto flex w-full max-w-(--page-max) flex-1 flex-col gap-6 px-(--page-x) py-[clamp(20px,5vw,40px)]">
      <header className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-center">
        <div className="flex flex-col gap-2">
          <Badge variant="secondary" className="self-start">
            {PERSONA_LABEL[route.persona]}
          </Badge>
          <h1 className="text-title font-bold">{route.title}</h1>
          <p className="text-sm text-muted-foreground">
            Автор: <span className="font-semibold text-foreground">{authorName(route)}</span>
          </p>
          <p>{route.description}</p>
        </div>
        <PhotoPlaceholder photo={route.cover} className="aspect-[16/9] w-full rounded-2xl max-md:hidden" />
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Карта маршрута" className="h-64 overflow-hidden rounded-2xl bg-muted md:h-80">
            <RouteMap stays={plan.stays} />
          </section>
          <section aria-labelledby="route-plan" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="route-plan" className="text-heading font-bold">
                План от двери до двери
              </h2>
              <div className="flex flex-col gap-1">
                <Label htmlFor="route-start">Начало</Label>
                <Input
                  id="route-start"
                  type="date"
                  className="w-44"
                  min={today}
                  max={addDays(today, 365)}
                  value={state.start}
                  onChange={(e) => e.target.value && edit((s) => ({ ...s, start: e.target.value }))}
                />
              </div>
            </div>
            <RouteTimeline
              plan={plan}
              defaults={route.transfers}
              transfers={state.transfers}
              onNights={(stop, nights) =>
                edit((s) => ({ ...s, nights: s.nights.map((n, i) => (i === stop ? nights : n)) }))
              }
              onTransfer={(leg, mode) =>
                edit((s) => ({ ...s, transfers: s.transfers.map((m, i) => (i === leg ? mode : m)) }))
              }
            />
          </section>
        </div>
        <aside className="lg:sticky lg:top-4">
          <RouteSummary route={route} plan={plan} />
        </aside>
      </div>
    </main>
  )
}

function AddressRoute(props: Props) {
  return <RouteView {...props} params={useSearchParams()} />
}

/**
 * The route page: header, the flat map of the stops, the door-to-door plan by day with the edits (start,
 * nights, transfers) and the two totals. The edits depend on the address, so a prerender shows the route as is.
 */
export function RoutePage(props: Props) {
  return (
    <Suspense fallback={<RouteView {...props} params={NO_EDITS} />}>
      <AddressRoute {...props} />
    </Suspense>
  )
}
