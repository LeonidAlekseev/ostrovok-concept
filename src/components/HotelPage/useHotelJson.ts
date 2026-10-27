import { useEffect, useState } from 'react'

/**
 * One field of a hotel's own route, `GET /api/hotels/<id>/<path>` (`view`, `view-map`, `noise-map`): `value` is
 * `null` until the answer comes, when the route has none for the hotel and on a failure; `loading` is true while the
 * answer for this hotel has not come. The request is aborted when the hotel changes or the section unmounts.
 */
export function useHotelJson<T>(hotelId: string, path: string, field: string, enabled = true) {
  const [state, setState] = useState<{ key: string; value: T | null } | null>(null)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetch(`/api/hotels/${encodeURIComponent(hotelId)}/${path}`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<Record<string, T | null>>) : null))
      .then((body) => setState({ key: hotelId, value: body?.[field] ?? null }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ key: hotelId, value: null })
      })
    return () => controller.abort()
  }, [hotelId, path, field, enabled])
  return { value: state?.value ?? null, loading: enabled && state?.key !== hotelId }
}
