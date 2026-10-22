import type { Metadata } from 'next'
import { unstable_rethrow } from 'next/navigation'
import { TripsPage } from '@/components/Trips/TripsPage'
import { loadDestinations } from '@/lib/db/catalog'
import { listTrips } from '@/lib/db/trips'
import { summarizeTrip, type TripSummary } from '@/lib/trip'

export const metadata: Metadata = { title: 'Мои поездки' }

/** The user's plans, read with the session under RLS; `null` when the database failed. */
async function loadPlans(): Promise<TripSummary[] | null> {
  try {
    const [{ trips, hotels }, destinations] = await Promise.all([listTrips(), loadDestinations()])
    const cityOf = (id: string) => destinations.find((d) => d.id === id)?.name ?? ''
    return trips.map(({ id, trip }) => summarizeTrip(id, trip, hotels, cityOf(trip.route.destinationId)))
  } catch (error) {
    // Reading the cookies marks the page dynamic by throwing: that is Next's, not a failure.
    unstable_rethrow(error)
    console.error('trips: plans unavailable:', error instanceof Error ? error.message : error)
    return null
  }
}

export default async function Page() {
  return <TripsPage plans={await loadPlans()} />
}
