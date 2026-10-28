'use client'

import { useEffect, useState } from 'react'
import type { HotelierHotelsResponse } from '@/app/api/hotelier/hotels/schema'
import type { HotelierHotel } from '@/lib/db/claims'

const NONE: ReadonlyMap<string, HotelierHotel> = new Map()

/**
 * The hotels whose hotelier told their characteristics, read once for the results (`GET /api/hotelier/hotels`); none
 * when it cannot be read — the results are the same without the mark.
 */
export function useHotelierHotels(): ReadonlyMap<string, HotelierHotel> {
  const [hotels, setHotels] = useState(NONE)
  useEffect(() => {
    let current = true
    fetch('/api/hotelier/hotels')
      .then((response) => (response.ok ? (response.json() as Promise<HotelierHotelsResponse>) : null))
      .then((body) => {
        if (current && body?.hotels.length) setHotels(new Map(body.hotels.map((h) => [h.hotelId, h])))
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [])
  return hotels
}
