'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import type { PlanStay } from '@/lib/routes'
import { HotelMapUnavailable } from '../HotelPage/HotelMapUnavailable'
import { hotelHref } from './hotelHref'

// MapLibre is loaded only in the browser.
const SearchMap = dynamic(
  () => import('../SearchResultsPage/SearchMap').catch(() => ({ default: () => <HotelMapUnavailable /> })),
  { ssr: false, loading: () => <div className="size-full animate-pulse bg-muted" aria-hidden /> },
)

/** The flat map of the route: a marker per stop with the estimate of its nights; a marker opens the hotel. */
export function RouteMap({ stays }: { stays: readonly PlanStay[] }) {
  const router = useRouter()
  const hotels = useMemo(() => stays.map(({ hotel, price }) => ({ hotel, price })), [stays])
  return (
    <SearchMap
      hotels={hotels}
      activeId={null}
      onOpen={(id) => router.push(hotelHref(id))}
      fallback={<HotelMapUnavailable />}
    />
  )
}
