/**
 * Ostrovok hotels that are one object under two `master_id`s: the duplicate (key) is folded into the hotel that has the
 * page and the room groups (value). The loaders skip the duplicate, so a rebuild does not bring it back; the site
 * redirects its old link (`next.config.ts`); `supabase/migrations/20261028200000_merge_reina_duplicate.sql` folds the rows.
 * `ota-9783413` and `ota-9559092` (Reina 107 Beach Boutique): the same point and address; the duplicate has a star
 * rating of 20 and no page of its own.
 */
export const MERGED_OTA_HOTELS: Readonly<Record<number, number>> = { 9783413: 9559092 }

/** The rows of a search or of the database without the folded duplicates. */
export function withoutMergedHotels<Row>(rows: readonly Row[], masterId: (row: Row) => number): Row[] {
  return rows.filter((row) => !(masterId(row) in MERGED_OTA_HOTELS))
}

/** The permanent redirects of the old `/hotels/ota-<duplicate>` links to the hotel they were folded into. */
export const mergedHotelRedirects = () =>
  Object.entries(MERGED_OTA_HOTELS).map(([from, to]) => ({
    source: `/hotels/ota-${from}`,
    destination: `/hotels/ota-${to}`,
    permanent: true,
  }))
