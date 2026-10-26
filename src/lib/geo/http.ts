import type { OsmService, RateGate } from './limits'
import { limited, timedOut, unavailable, type GeoResult } from './result'

/**
 * A request to an OSM service (Nominatim, Overpass, OSRM): the project's User-Agent, the turn of the rate limit, a
 * timeout within the time the turn has left, and any failure as a `GeoFailure`. No `server-only`: the loading script
 * asks Overpass the same way.
 */

/** The services ask for an identifying User-Agent with a contact: the repository, not a personal address. */
export const USER_AGENT = 'ostrovok-concept/1.0 (+https://github.com/LeonidAlekseev/ostrovok-concept)'

/** The time of a call: when the whole answer is due (ms since the epoch) and the abort of the request. */
export interface CallBudget {
  deadline: number
  signal?: AbortSignal
}

/** A call is not started with less than this left of the budget: it would not answer anyway. */
export const MIN_CALL_MS = 300

/** The wait after a 429 without `Retry-After`. */
const DEFAULT_RETRY_AFTER_S = 60

/** `Retry-After` in seconds, given as seconds or as an HTTP date; `undefined` without a usable one. */
export function retryAfterSeconds(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1, Math.ceil(seconds))
  const date = Date.parse(header)
  return Number.isNaN(date) ? undefined : Math.max(1, Math.ceil((date - now) / 1000))
}

export interface OsmRequest {
  service: OsmService
  url: string
  /** The service's own time; the budget may cut it shorter. */
  timeoutMs: number
  budget: CallBudget
  gate: RateGate
  init?: Omit<RequestInit, 'headers' | 'signal'> & { headers?: Record<string, string> }
  fetch?: typeof fetch
}

/**
 * Fetches `url` and gives the parsed JSON. A 429 closes the service in `gate` for its `Retry-After` and is `limited`;
 * other failed statuses, a network error or a body that is not JSON are `unavailable`; the timeout is `timeout`. The
 * abort of `budget.signal` throws, as the rest of the turn does.
 */
export async function osmJson({
  service,
  url,
  timeoutMs,
  budget,
  gate,
  init,
  fetch: fetchImpl = fetch,
}: OsmRequest): Promise<GeoResult<unknown>> {
  const left = () => budget.deadline - Date.now()
  if (left() < MIN_CALL_MS) return timedOut(service)
  const turn = await gate.acquire(service, left() - MIN_CALL_MS)
  if (!turn.ok) return limited(service, turn.retryAfterS)
  if (left() < MIN_CALL_MS) return timedOut(service)
  const timeout = AbortSignal.timeout(Math.min(timeoutMs, left()))
  const signal = budget.signal ? AbortSignal.any([budget.signal, timeout]) : timeout
  try {
    const response = await fetchImpl(url, {
      ...init,
      headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...init?.headers },
      signal,
    })
    if (response.status === 429) {
      const seconds = retryAfterSeconds(response.headers.get('retry-after')) ?? DEFAULT_RETRY_AFTER_S
      gate.close(service, seconds)
      return limited(service, seconds)
    }
    if (!response.ok) {
      console.warn(`geo: ${service} HTTP ${response.status}`)
      return unavailable(service)
    }
    const text = await response.text()
    try {
      return { ok: true, value: JSON.parse(text) }
    } catch {
      console.warn(`geo: ${service} answered not JSON`)
      return unavailable(service)
    }
  } catch (error) {
    if (budget.signal?.aborted) throw error
    if (timeout.aborted) return timedOut(service)
    console.warn(`geo: ${service} request failed (${error instanceof Error ? error.name : 'error'})`)
    return unavailable(service)
  }
}
