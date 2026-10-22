'use client'

import Link from 'next/link'
import { Repeat } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { useSession } from '@/hooks/useStore'

/**
 * «Повторить маршрут»: the copy of the route, where the dates, nights, transfers and leisure are edited.
 * A guest signs in first and comes back to the copy.
 */
export function RepeatRouteLink({ routeId }: { routeId: string }) {
  const session = useSession()
  // TODO(trip-copy): /trip/new creates the copy of the route; the page comes with that change.
  const copy = `/trip/new?route=${encodeURIComponent(routeId)}`
  return (
    <Link
      className={buttonVariants({ size: 'lg', shape: 'pill' })}
      href={session ? copy : `/login?next=${encodeURIComponent(copy)}`}
    >
      <Repeat aria-hidden /> Повторить маршрут
    </Link>
  )
}
