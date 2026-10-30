import 'server-only'
import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/database.types'
import { anonStandaloneClient, hasBrowserRows } from '@/lib/standalone/server'

/**
 * What the server-side readers of src/lib/db share: the anon client, the test of a real hotel, the cache of the
 * catalogue and the «read or `null`» of a real hotel's data. Everything here reads with the anon key, so RLS and the
 * functions' grants decide what is visible, exactly as for the browser.
 */

/**
 * The server's cache of the catalogue: dropped by `POST /api/revalidate` (`npm run db:seed -- --revalidate`), else
 * kept an hour. Kept here, not in catalog.ts, so that every reader can use it without importing the catalogue.
 */
export const CATALOG_TAG = 'catalog'
/** Seconds the server keeps the catalogue. */
export const CATALOG_LIFETIME = 3600

/** A client with the anon key and no session: the server reads for everybody, never as a user. */
export const anonClient = () => anonStandaloneClient() as unknown as SupabaseClient<Database>

export type AnonClient = ReturnType<typeof anonClient>

/**
 * A real hotel of the database (`ota-<master_id>`, see `otaHotelId`) when Supabase is configured. A synthetic hotel
 * of the generator has no geodata, pages or features, so its readers answer `null` without asking.
 */
export const isRealHotelId = (id: string) => /^ota-\d{1,15}$/.test(id)

/** Where a hotel's geodata are read: its id decides whether there are any (`isRealHotelId`). */
export interface HotelPoint {
  id: string
  lat: number
  lon: number
}

/** A warning with the kind and the provider's short message only: never a key, a body or a stack. */
export const warnShort = (what: string, error: unknown) =>
  console.warn(`${what} (${String((error as { message?: unknown })?.message ?? error).slice(0, 200)})`)

/**
 * `read` cached with the catalogue under `[CATALOG_TAG, ...key]`. Bump the key's version when the cached value
 * changes its shape: an entry of before stays in the cache until it expires.
 */
export const catalogCached = <Args extends unknown[], Result>(
  key: readonly string[],
  read: (...args: Args) => Promise<Result>,
) => {
  const cached = unstable_cache(read, [CATALOG_TAG, ...key], { tags: [CATALOG_TAG], revalidate: CATALOG_LIFETIME })
  // A request with the browser's own rows (the hotelier's answers of the standalone demo) reads past the cache.
  return (...args: Args): Promise<Result> => (hasBrowserRows() ? read(...args) : cached(...args))
}

/**
 * The data of a real hotel, or `null` for a synthetic one and on a failure, which is logged as «`what`: none for
 * <id>»: the page and Эвал then say they do not know instead of failing.
 */
export async function readOrNull<T>(hotelId: string, what: string, read: () => Promise<T>): Promise<T | null> {
  if (!isRealHotelId(hotelId)) return null
  try {
    return await read()
  } catch (error) {
    warnShort(`${what}: none for ${hotelId}`, error)
    return null
  }
}
