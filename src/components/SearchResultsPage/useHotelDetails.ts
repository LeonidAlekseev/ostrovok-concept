'use client'

import { useEffect, useState } from 'react'
import { REAL_HOTEL_ID_PREFIX } from '@/lib/catalog'
import type { HotelDetails } from '@/lib/hotelDetails'

/**
 * The details of the real hotel's Ostrovok page (`GET /api/hotels/<id>/details`) for the hotel dialog: `null` until
 * they come, for a synthetic hotel and on a failure, when the dialog shows the hotel's row alone.
 */
export function useHotelDetails(hotelId: string | undefined): HotelDetails | null {
  const [loaded, setLoaded] = useState<{ id: string; details: HotelDetails | null } | null>(null)
  useEffect(() => {
    if (!hotelId?.startsWith(REAL_HOTEL_ID_PREFIX)) return
    const controller = new AbortController()
    fetch(`/api/hotels/${encodeURIComponent(hotelId)}/details`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ details: HotelDetails | null }>) : null))
      .then((body) => setLoaded({ id: hotelId, details: body?.details ?? null }))
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ id: hotelId, details: null })
      })
    return () => controller.abort()
  }, [hotelId])
  return loaded && loaded.id === hotelId ? loaded.details : null
}
