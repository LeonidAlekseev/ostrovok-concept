import 'server-only'

export const RATE_LIMIT = 20
/** The photos of the chat a minute: the model that sees them is the heavy one, and the key allows 40 requests. */
export const VISION_RATE_LIMIT = 6
export const RATE_WINDOW_MS = 60_000

type Hits = Map<string, { count: number; resetAt: number }>

/** Requests per IP in the current window; kept in the process memory, so each server instance counts its own. */
const hits: Hits = new Map()
const visionHits: Hits = new Map()

function allow(counter: Hits, limit: number, ip: string, now: number): boolean {
  if (counter.size > 10_000) for (const [key, hit] of counter) if (hit.resetAt <= now) counter.delete(key)
  const hit = counter.get(ip)
  if (!hit || hit.resetAt <= now) {
    counter.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  hit.count += 1
  return hit.count <= limit
}

/** Counts the request and tells whether `ip` is still within `RATE_LIMIT` requests per minute. */
export function allowRequest(ip: string, now = Date.now()): boolean {
  return allow(hits, RATE_LIMIT, ip, now)
}

/** Counts a look at the photos and tells whether `ip` is still within `VISION_RATE_LIMIT` a minute. */
export function allowVisionRequest(ip: string, now = Date.now()): boolean {
  return allow(visionHits, VISION_RATE_LIMIT, ip, now)
}

/** The client's address behind the Vercel proxy, from a request or from a server action's `headers()`. */
export function clientIp({ headers }: { headers: Pick<Headers, 'get'> }): string {
  return headers.get('x-forwarded-for')?.split(',')[0].trim() || headers.get('x-real-ip') || 'local'
}
