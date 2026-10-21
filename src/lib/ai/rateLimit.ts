import 'server-only'

export const RATE_LIMIT = 20
export const RATE_WINDOW_MS = 60_000

/** Requests per IP in the current window; kept in the process memory, so each server instance counts its own. */
const hits = new Map<string, { count: number; resetAt: number }>()

/** Counts the request and tells whether `ip` is still within `RATE_LIMIT` requests per minute. */
export function allowRequest(ip: string, now = Date.now()): boolean {
  if (hits.size > 10_000) for (const [key, hit] of hits) if (hit.resetAt <= now) hits.delete(key)
  const hit = hits.get(ip)
  if (!hit || hit.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  hit.count += 1
  return hit.count <= RATE_LIMIT
}

/** The client's address behind the Vercel proxy. */
export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local'
}
