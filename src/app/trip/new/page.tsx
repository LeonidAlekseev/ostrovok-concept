import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CopyRoute } from '@/components/TripPlan/CopyRoute'
import { signedIn } from '@/lib/db/trips'
import { newTripPath } from '@/lib/trip'

type Props = { searchParams: Promise<{ route?: string | string[] }> }

export const metadata: Metadata = { title: 'Копируем маршрут', robots: { index: false } }

/**
 * «Повторить маршрут»: a guest signs in first and comes back; then the page copies the route with a server
 * action (a POST, so a prefetch or a reload of the plan never makes a copy) and opens the plan.
 */
export default async function Page({ searchParams }: Props) {
  const { route } = await searchParams
  const routeId = typeof route === 'string' ? route : ''
  if (!(await signedIn())) redirect(`/login?next=${encodeURIComponent(newTripPath(routeId))}`)
  return <CopyRoute routeId={routeId} />
}
