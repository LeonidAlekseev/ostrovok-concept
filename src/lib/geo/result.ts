/**
 * What the geo tools give back: a value or an honest failure with the words for the traveller. Never a guess: a
 * service that limited or failed is said so, with the time to wait when the service gave it.
 */

export type GeoService = 'nominatim' | 'overpass' | 'osrm' | 'database'

export type GeoFailure =
  /** The service limited the requests (429, or our own limit of its rules); `retryAfterS` is the wait. */
  | { ok: false; reason: 'limited'; service: GeoService; retryAfterS: number; message: string }
  /** The service failed, refused or is overloaded; or did not answer within its time. */
  | { ok: false; reason: 'unavailable' | 'timeout'; service: GeoService; message: string }
  /** Nothing found for the query, or the query asks outside the area the tools serve. */
  | { ok: false; reason: 'not-found' | 'outside'; message: string }

export type GeoResult<T> = { ok: true; value: T } | GeoFailure

const SERVICE_LABEL: Record<GeoService, string> = {
  nominatim: 'поиска адресов OpenStreetMap',
  overpass: 'мест OpenStreetMap',
  osrm: 'маршрутов OpenStreetMap',
  database: 'базы мест',
}

export const limited = (service: GeoService, retryAfterS: number): GeoFailure => ({
  ok: false,
  reason: 'limited',
  service,
  retryAfterS,
  message: `Сервис ${SERVICE_LABEL[service]} ограничил запросы, подождите ${retryAfterS} с.`,
})

export const unavailable = (service: GeoService): GeoFailure => ({
  ok: false,
  reason: 'unavailable',
  service,
  message: `Не удалось проверить: сервис ${SERVICE_LABEL[service]} сейчас недоступен.`,
})

export const timedOut = (service: GeoService): GeoFailure => ({
  ok: false,
  reason: 'timeout',
  service,
  message: `Не удалось проверить: сервис ${SERVICE_LABEL[service]} не ответил вовремя.`,
})

export const notFound = (message: string): GeoFailure => ({ ok: false, reason: 'not-found', message })
export const outside = (message: string): GeoFailure => ({ ok: false, reason: 'outside', message })

export const ok = <T>(value: T): GeoResult<T> => ({ ok: true, value })
