import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TripPlanPage } from '@/components/TripPlan/TripPlanPage'
import { loadDestination } from '@/lib/db/catalog'
import { loadTrip } from '@/lib/db/trips'

type Props = { params: Promise<{ tripId: string }> }

export const metadata: Metadata = { title: 'Мой план', robots: { index: false } }

/** The user's plan: someone else's, an unknown id or a guest get «не найдено». */
export default async function Page({ params }: Props) {
  const loaded = await loadTrip((await params).tripId)
  if (!loaded) notFound()
  const destination = await loadDestination(loaded.trip.route.destinationId)
  return (
    <TripPlanPage
      tripId={loaded.id}
      initialTrip={loaded.trip}
      initialHotels={loaded.hotels}
      city={destination?.name ?? ''}
    />
  )
}
