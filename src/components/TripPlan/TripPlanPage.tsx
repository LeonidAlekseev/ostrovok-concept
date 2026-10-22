'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { saveTripEdits } from '@/app/trip/actions'
import { Badge } from '@/components/ui/badge'
import type { Hotel } from '@/lib/catalog'
import { PERSONA_LABEL } from '@/lib/routes'
import {
  replaceHotel,
  replaceLeisure,
  tripEdits,
  tripPlan,
  type LeisureFields,
  type TripData,
  type TripLeisure,
} from '@/lib/trip'
import { RouteMap } from '../RoutePage/RouteMap'
import { HotelSwapDialog } from './HotelSwapDialog'
import { LeisureAlternatives } from './LeisureAlternatives'
import { TripSummary } from './TripSummary'
import { TripTimeline } from './TripTimeline'
import { useAutosave } from './useAutosave'

interface Props {
  tripId: string
  initialTrip: TripData
  /** The hotels of the stops by id. */
  initialHotels: Record<string, Hotel>
  city: string
}

/**
 * The user's plan, a copy of a route: the map of the stops, the plan by calendar day with its edits, and the
 * exact price. Edits apply at once and are saved a moment later with the user's session.
 */
export function TripPlanPage({ tripId, initialTrip, initialHotels, city }: Props) {
  const [trip, setTrip] = useState(initialTrip)
  const [hotels, setHotels] = useState(initialHotels)
  const [swapStop, setSwapStop] = useState<number | null>(null)
  const [alternativesOf, setAlternativesOf] = useState<TripLeisure | null>(null)
  const plan = useMemo(() => tripPlan(trip, hotels), [trip, hotels])
  const save = useAutosave(
    trip,
    useCallback((value: TripData) => saveTripEdits(tripId, tripEdits(value)), [tripId]),
  )
  const edit = useCallback((change: (t: TripData) => TripData) => setTrip(change), [])

  const pickHotel = (hotel: Hotel) => {
    if (swapStop === null) return
    const stop = swapStop
    setHotels((current) => ({ ...current, [hotel.id]: hotel }))
    edit((t) => replaceHotel(t, stop, hotel.id))
    setSwapStop(null)
  }
  const pickLeisure = (fields: LeisureFields) => {
    if (!alternativesOf) return
    const id = alternativesOf.id
    edit((t) => replaceLeisure(t, id, fields))
    setAlternativesOf(null)
  }

  return (
    <main className="mx-auto flex w-full max-w-(--page-max) flex-1 flex-col gap-6 px-(--page-x) py-[clamp(20px,5vw,40px)]">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Мой план</Badge>
          <Badge variant="secondary">{PERSONA_LABEL[trip.route.persona]}</Badge>
        </div>
        <h1 className="text-title font-bold">{trip.route.title}</h1>
        <p className="text-sm text-muted-foreground">
          {city && `${city} · `}копия маршрута{' '}
          <Link href={`/routes/${trip.route.id}`} className="font-semibold text-primary hover:underline">
            «{trip.route.title}»
          </Link>{' '}
          ·{' '}
          <Link href="/trips" className="font-semibold text-primary hover:underline">
            Мои поездки
          </Link>
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Карта плана" className="h-64 overflow-hidden rounded-2xl bg-muted md:h-80">
            <RouteMap stays={plan.stays} />
          </section>
          <section aria-labelledby="trip-plan" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="trip-plan" className="text-heading font-bold">
                План от двери до двери
              </h2>
              <p className="text-sm text-muted-foreground">
                Досуг можно перетащить или переставить кнопками «выше» и «ниже», перенести на другой день и заменить.
              </p>
            </div>
            <TripTimeline
              trip={trip}
              plan={plan}
              onEdit={edit}
              onSwapHotel={setSwapStop}
              onAlternatives={setAlternativesOf}
            />
          </section>
        </div>
        <aside className="lg:sticky lg:top-4">
          <TripSummary tripId={tripId} trip={trip} plan={plan} save={save} onEdit={edit} />
        </aside>
      </div>

      <HotelSwapDialog
        trip={trip}
        plan={plan}
        hotels={hotels}
        stop={swapStop}
        onClose={() => setSwapStop(null)}
        onPick={pickHotel}
      />
      <LeisureAlternatives
        tripId={tripId}
        start={trip.start}
        item={alternativesOf}
        onClose={() => setAlternativesOf(null)}
        onPick={pickLeisure}
      />
    </main>
  )
}
