import 'server-only'
import { createHash } from 'node:crypto'
import { serviceClient } from '@/lib/db/serviceClient'

export const RATE_LIMIT = 20
/** The questions of a chat about a hotel a minute: a limit of their own, so they do not take the search's requests. */
export const HOTEL_RATE_LIMIT = 20
/** The photos of the chat a minute: the model that sees them is the heavy one, and the key allows 40 requests. */
export const VISION_RATE_LIMIT = 20
export const RATE_WINDOW_MS = 60_000
/** How long the shared counter may take before the instance counts the photos itself. */
export const SHARED_COUNTER_TIMEOUT_MS = 2000

type Hits = Map<string, { count: number; resetAt: number }>

/** Requests per IP in the current window; kept in the process memory, so each server instance counts its own. */
const hits: Hits = new Map()
const visionHits: Hits = new Map()
const hotelHits: Hits = new Map()

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

/** The key of the shared counter: the kind of the limit and a hash of the IP, so the counter keeps no address. */
function sharedKey(kind: 'request' | 'vision' | 'hotel', ip: string): string {
  return `${kind}:${createHash('sha256').update(ip).digest('hex').slice(0, 32)}`
}

/**
 * Counts the request and tells whether `ip` is still within `RATE_LIMIT` requests a minute: in Supabase, shared by
 * the instances of the server, or in the process memory without it.
 */
export async function allowRequest(ip: string, now = Date.now()): Promise<boolean> {
  return (await allowShared(sharedKey('request', ip), RATE_LIMIT).catch(() => null)) ?? allow(hits, RATE_LIMIT, ip, now)
}

/** The same count for the questions of a chat about a hotel, apart from `allowRequest`'s. */
export async function allowHotelRequest(ip: string, now = Date.now()): Promise<boolean> {
  return (
    (await allowShared(sharedKey('hotel', ip), HOTEL_RATE_LIMIT).catch(() => null)) ??
    allow(hotelHits, HOTEL_RATE_LIMIT, ip, now)
  )
}

/**
 * Counts a hit in Supabase (`rate_limit_hit`, supabase/migrations/…_photo_limit_and_shared_photos.sql), one window
 * for every instance; `null` when the counter is not there (no Supabase or key, the migration not applied, an error,
 * no answer in time), and the instance counts in its memory instead.
 */
async function allowShared(key: string, limit: number): Promise<boolean | null> {
  const client = await serviceClient()
  if (!client) return null
  const { data, error } = await client
    .rpc('rate_limit_hit', { hit_key: key, hit_limit: limit, window_seconds: RATE_WINDOW_MS / 1000 })
    .abortSignal(AbortSignal.timeout(SHARED_COUNTER_TIMEOUT_MS))
  if (error || typeof data !== 'boolean') {
    console.warn(`rate_limit_hit: ${error?.message.slice(0, 200) ?? 'no answer'}`)
    return null
  }
  return data
}

/**
 * Counts a look at the photos and tells whether `ip` is still within `VISION_RATE_LIMIT` a minute: in Supabase, shared
 * by the instances of the server, or in the process memory without it. The counter keeps a hash of the IP.
 */
export async function allowVisionRequest(ip: string, now = Date.now()): Promise<boolean> {
  return (
    (await allowShared(sharedKey('vision', ip), VISION_RATE_LIMIT).catch(() => null)) ??
    allow(visionHits, VISION_RATE_LIMIT, ip, now)
  )
}

/** The client's address behind the Vercel proxy, from a request or from a server action's `headers()`. */
export function clientIp({ headers }: { headers: Pick<Headers, 'get'> }): string {
  return headers.get('x-forwarded-for')?.split(',')[0].trim() || headers.get('x-real-ip') || 'local'
}
