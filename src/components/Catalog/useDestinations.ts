'use client'

import { createContext, use } from 'react'
import type { Destination } from '@/data/destinations'

/** The destinations of the catalogue, from the root layout (CatalogProvider). */
export const DestinationsContext = createContext<readonly Destination[] | null>(null)

/** All destinations, in the catalogue's order. */
export function useDestinations(): readonly Destination[] {
  const destinations = use(DestinationsContext)
  if (!destinations) throw new Error('useDestinations needs a CatalogProvider')
  return destinations
}

export const useDestination = (id: string): Destination | undefined => useDestinations().find((d) => d.id === id)
