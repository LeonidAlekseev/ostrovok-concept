'use client'

import { useEffect, useState } from 'react'
import type { Hotel } from '@/lib/catalog'
import { boxParam, type MapBox } from '@/lib/mapBox'

export type HotelsQuery = { ids: readonly string[] } | { destinations: readonly string[] } | { bbox: MapBox }

export type HotelsState =
  { status: 'loading' } | { status: 'done'; hotels: Hotel[] } | { status: 'error'; message: string }

export const HOTELS_ERROR = 'Не удалось загрузить отели'

const urlOf = (query: HotelsQuery) =>
  'bbox' in query
    ? `/api/hotels?bbox=${boxParam(query.bbox)}`
    : 'ids' in query
      ? `/api/hotels?ids=${query.ids.join(',')}`
      : `/api/hotels?destinations=${query.destinations.join(',')}`

/** One request a set of hotels per page load; a failed one is dropped, so the next call tries again. */
const requests = new Map<string, Promise<Hotel[]>>()

/**
 * Full hotels from `GET /api/hotels`, for the places that know only the ids (favourites, trips, the search) and for the
 * map around a hotel (a box of it).
 */
export function fetchHotels(query: HotelsQuery): Promise<Hotel[]> {
  if (!('bbox' in query) && ('ids' in query ? query.ids : query.destinations).length === 0) return Promise.resolve([])
  const url = urlOf(query)
  let request = requests.get(url)
  if (!request) {
    request = fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(HOTELS_ERROR)
        return ((await response.json()) as { hotels: Hotel[] }).hotels
      })
      .catch((error: unknown) => {
        requests.delete(url)
        throw error instanceof Error && error.message === HOTELS_ERROR ? error : new Error(HOTELS_ERROR)
      })
    requests.set(url, request)
  }
  return request
}

/** Forgets the fetched hotels: for the tests. */
export const clearHotelRequests = () => requests.clear()

/**
 * The hotels of `query` (`null` — nothing to load yet), loaded once per distinct set of ids. A new `attempt` asks
 * again after an error.
 */
export function useHotels(query: HotelsQuery | null, attempt = 0): HotelsState {
  const key = query ? `${urlOf(query)}#${attempt}` : null
  const [state, setState] = useState<{ key: string | null; value: HotelsState }>({ key, value: { status: 'loading' } })

  useEffect(() => {
    if (!query) return
    let current = true
    fetchHotels(query).then(
      (hotels) => current && setState({ key, value: { status: 'done', hotels } }),
      (error: Error) => current && setState({ key, value: { status: 'error', message: error.message } }),
    )
    return () => {
      current = false
    }
    // The key stands for the query: a new array with the same ids is the same request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state.key === key ? state.value : { status: 'loading' }
}

/** One hotel by id; `hotel` is `undefined` while loading, on an error, for an unknown id or without one. */
export function useHotel(id: string | undefined): { status: HotelsState['status']; hotel: Hotel | undefined } {
  const state = useHotels(id ? { ids: [id] } : null)
  if (!id) return { status: 'done', hotel: undefined }
  return { status: state.status, hotel: state.status === 'done' ? state.hotels[0] : undefined }
}
