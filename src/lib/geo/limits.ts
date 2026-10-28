/**
 * The rate limits of the OSM services, ported from osmmcp's `pkg/osm/ratelimit.go`: a gap between the requests of
 * this process and, when the server brings it, a counter shared by all its instances (`rate_limit_hit`). After a 429
 * the service is closed for its `Retry-After`: no request goes out until then.
 */

export type OsmService = 'nominatim' | 'overpass' | 'osrm'
/** What the gate counts: Overpass's reserve server has its turn of its own. */
export type GateKey = OsmService | 'overpass-reserve'

export interface RateRule {
  /** The least time between two requests of this process. */
  gapMs: number
  /** The shared limit: `limit` requests in `windowS` seconds for all the instances. */
  limit: number
  windowS: number
}

/**
 * Nominatim: an absolute maximum of 1 request a second (the OSMF policy). Overpass: 10 a minute (osmmcp keeps 2 for
 * its background work; ours are rare and stop at a 429). OSRM of FOSSGIS: 1 a second.
 */
export const RATE_RULES: Record<GateKey, RateRule> = {
  nominatim: { gapMs: 1000, limit: 1, windowS: 1 },
  overpass: { gapMs: 6000, limit: 10, windowS: 60 },
  osrm: { gapMs: 1000, limit: 1, windowS: 1 },
  'overpass-reserve': { gapMs: 6000, limit: 10, windowS: 60 },
}

/** Counts a request in the shared window: `true` within the limit, `null` when the counter is not there. */
export type SharedCounter = (key: string, limit: number, windowS: number) => Promise<boolean | null>

export interface GateOptions {
  shared?: SharedCounter
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export type GateResult = { ok: true } | { ok: false; retryAfterS: number }

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export class RateGate {
  private next = new Map<GateKey, number>()
  private closedUntil = new Map<GateKey, number>()
  private readonly rules: Record<GateKey, RateRule>
  private readonly options: GateOptions

  constructor(rules: Record<GateKey, RateRule> = RATE_RULES, options: GateOptions = {}) {
    this.rules = rules
    this.options = options
  }

  private now() {
    return (this.options.now ?? Date.now)()
  }

  private sleep(ms: number) {
    return ms > 0 ? (this.options.sleep ?? pause)(ms) : Promise.resolve()
  }

  /** Closes `service` for `seconds` (a 429's `Retry-After`). */
  close(service: GateKey, seconds: number) {
    const until = this.now() + seconds * 1000
    this.closedUntil.set(service, Math.max(until, this.closedUntil.get(service) ?? 0))
  }

  /**
   * Waits for the turn of a request to `service`, no longer than `maxWaitMs`; a turn further away, a closed service
   * or a full shared window give the wait in seconds instead.
   */
  async acquire(service: GateKey, maxWaitMs: number): Promise<GateResult> {
    const rule = this.rules[service]
    const now = this.now()
    const closed = (this.closedUntil.get(service) ?? 0) - now
    if (closed > 0) return { ok: false, retryAfterS: Math.ceil(closed / 1000) }
    const start = Math.max(this.next.get(service) ?? 0, now)
    const wait = start - now
    if (wait > maxWaitMs) return { ok: false, retryAfterS: Math.max(1, Math.ceil(wait / 1000)) }
    this.next.set(service, start + rule.gapMs)
    await this.sleep(wait)
    const shared = this.options.shared
    if (!shared) return { ok: true }
    const key = `osm:${service}`
    let allowed = await shared(key, rule.limit, rule.windowS).catch(() => null)
    // A full one-second window frees soon: one more try when the time allows.
    if (allowed === false && rule.windowS * 1000 <= maxWaitMs - wait) {
      await this.sleep(rule.windowS * 1000)
      allowed = await shared(key, rule.limit, rule.windowS).catch(() => null)
    }
    return allowed === false ? { ok: false, retryAfterS: rule.windowS } : { ok: true }
  }
}
