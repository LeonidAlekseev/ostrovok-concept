import 'server-only'
import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/database.types'
import { getSecret } from '@/lib/secrets'
import { isSupabaseConfigured, supabaseUrl } from '@/lib/supabase/config'

export const RATE_LIMIT = 20
/** The photos of the chat a minute: the model that sees them is the heavy one, and the key allows 40 requests. */
export const VISION_RATE_LIMIT = 20
export const RATE_WINDOW_MS = 60_000
/** How long the shared counter may take before the instance counts the photos itself. */
export const SHARED_COUNTER_TIMEOUT_MS = 2000

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

let counterClient: Promise<SupabaseClient<Database> | null> | undefined

/** The client of the shared counter, with the service role key; `null` without Supabase or the key. */
function sharedCounter() {
  counterClient ??= (async () => {
    const key = isSupabaseConfigured ? await getSecret('SUPABASE_SERVICE_ROLE_KEY').catch(() => undefined) : undefined
    return key
      ? createClient<Database>(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } })
      : null
  })()
  return counterClient
}

/**
 * Counts a hit in Supabase (`rate_limit_hit`, supabase/migrations/…_photo_limit_and_shared_photos.sql), one window
 * for every instance; `null` when the counter is not there (no Supabase or key, the migration not applied, an error,
 * no answer in time), and the instance counts in its memory instead.
 */
async function allowShared(key: string, limit: number): Promise<boolean | null> {
  const client = await sharedCounter()
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
  const key = `vision:${createHash('sha256').update(ip).digest('hex').slice(0, 32)}`
  return (await allowShared(key, VISION_RATE_LIMIT).catch(() => null)) ?? allow(visionHits, VISION_RATE_LIMIT, ip, now)
}

/** The client's address behind the Vercel proxy, from a request or from a server action's `headers()`. */
export function clientIp({ headers }: { headers: Pick<Headers, 'get'> }): string {
  return headers.get('x-forwarded-for')?.split(',')[0].trim() || headers.get('x-real-ip') || 'local'
}
