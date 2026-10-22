'use client'

import { useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Hotel } from '@/lib/catalog'
import { todayIso } from '@/lib/dates'
import { buildPlan, parseRouteState, toRouteParams, type Route, type RouteState } from '@/lib/routes'

/**
 * The plan of the route with the user's edits from the address. An edit replaces the address, so a reload
 * or coming back to the page keeps it; nothing is saved on the server.
 */
export function useRoutePlan(
  route: Route,
  hotels: Readonly<Record<string, Hotel>>,
  params: Pick<URLSearchParams, 'get'>,
) {
  const pathname = usePathname()
  const router = useRouter()
  const today = todayIso()
  const state = useMemo(() => parseRouteState(route, params, today), [route, params, today])
  const plan = useMemo(() => buildPlan(route, hotels, state), [route, hotels, state])
  const edit = (change: (state: RouteState) => RouteState) =>
    router.replace(`${pathname}?${toRouteParams(route, change(state))}`, { scroll: false })
  return { state, plan, edit }
}
