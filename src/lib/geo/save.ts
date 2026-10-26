import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../db/database.types'
import type { OsmPlaceRow } from './overpass'

/** Rows an upsert: small enough for the database's short statement timeout. */
const BATCH = 200
/** The time of one batch. */
const BATCH_TIMEOUT_MS = 10_000

/**
 * Upserts `rows` into `osm_places` in batches with the service role; a repeated element updates its row (tags,
 * shape, time), nothing is deleted. No `server-only`: the loading script writes the same way; `false` on an error.
 */
export async function saveRows(
  client: SupabaseClient<Database>,
  rows: readonly OsmPlaceRow[],
  origin: 'preload' | 'online',
): Promise<boolean> {
  const fetchedAt = new Date().toISOString()
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((row) => ({ ...row, origin, fetched_at: fetchedAt }))
    const { error } = await client
      .from('osm_places')
      .upsert(batch, { onConflict: 'osm_type,osm_id' })
      .abortSignal(AbortSignal.timeout(BATCH_TIMEOUT_MS))
    if (error) {
      console.warn(`geo: osm_places upsert failed (${error.message.slice(0, 200)})`)
      return false
    }
  }
  return true
}
