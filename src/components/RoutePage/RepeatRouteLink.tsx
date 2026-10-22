'use client'

import Link from 'next/link'
import { Repeat } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { useSession } from '@/hooks/useStore'
import { newTripPath } from '@/lib/trip'

/**
 * «Повторить маршрут»: the copy of the route in the user's plans, where the dates, nights, transfers, hotels
 * and leisure are edited. A guest signs in first and comes back to the copy.
 */
export function RepeatRouteLink({ routeId }: { routeId: string }) {
  const session = useSession()
  const copy = newTripPath(routeId)
  return (
    <Link
      className={buttonVariants({ size: 'lg', shape: 'pill' })}
      href={session ? copy : `/login?next=${encodeURIComponent(copy)}`}
    >
      <Repeat aria-hidden /> Повторить маршрут
    </Link>
  )
}
