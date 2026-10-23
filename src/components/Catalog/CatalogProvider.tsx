'use client'

import type { ReactNode } from 'react'
import type { Destination } from '@/data/destinations'
import { DestinationsContext } from './useDestinations'

/** The destinations of the catalogue for the client components: the root layout reads them from Supabase. */
export function CatalogProvider({
  destinations,
  children,
}: {
  destinations: readonly Destination[]
  children: ReactNode
}) {
  return <DestinationsContext value={destinations}>{children}</DestinationsContext>
}
