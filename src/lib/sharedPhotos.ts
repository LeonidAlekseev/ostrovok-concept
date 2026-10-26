import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The photos of the shared snapshots (src/lib/assistantShare.ts) in the public bucket, at
 * `<user_id>/<share_id>/<n>.webp`: what is left of a snapshot deleted, found and removed through the Storage API (a
 * file deleted from `storage.objects` with SQL stays in the storage behind it). The owner lists and removes their own
 * folder (supabase/migrations/…_photo_limit_and_shared_photos.sql); `npm run db:clean:shared-photos` every folder,
 * with the service role key. No app imports: the script runs this file in Node.
 */

export const SHARED_PHOTO_BUCKET = 'assistant-shared-attachments'

/** A folder younger than this may be a snapshot being shared right now: its photos are copied before its row. */
export const ORPHAN_AGE_MS = 60 * 60 * 1000

const PAGE = 1000

type Bucket = ReturnType<SupabaseClient['storage']['from']>
type Entry = { name: string; id: string | null; created_at?: string | null }

/** Every entry right under the prefix (a folder has no id). */
async function listAll(bucket: Bucket, prefix: string): Promise<Entry[]> {
  const entries: Entry[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`${SHARED_PHOTO_BUCKET}: ${error.message.slice(0, 200)}`)
    entries.push(...data)
    if (data.length < PAGE) return entries
  }
}

/** The files of the folder `<user_id>/<share_id>`. */
export async function sharePhotoPaths(bucket: Bucket, folder: string): Promise<string[]> {
  const entries = await listAll(bucket, folder)
  return entries.filter((e) => e.id !== null).map((e) => `${folder}/${e.name}`)
}

/** The user folders of the bucket, for the cleaning of every folder. */
export async function sharedPhotoOwners(bucket: Bucket): Promise<string[]> {
  return (await listAll(bucket, '')).filter((e) => e.id === null).map((e) => e.name)
}

/**
 * The files of the user's folders with no snapshot in `shareIds`, older than `ORPHAN_AGE_MS`: a folder with a newer
 * file is left for the next time.
 */
export async function orphanSharedPhotos(
  bucket: Bucket,
  userId: string,
  shareIds: ReadonlySet<string>,
  now = Date.now(),
): Promise<string[]> {
  const orphans: string[] = []
  for (const folder of await listAll(bucket, userId)) {
    if (folder.id !== null || shareIds.has(folder.name)) continue
    const files = (await listAll(bucket, `${userId}/${folder.name}`)).filter((e) => e.id !== null)
    const fresh = files.some((f) => !f.created_at || now - Date.parse(f.created_at) < ORPHAN_AGE_MS)
    if (!fresh) orphans.push(...files.map((f) => `${userId}/${folder.name}/${f.name}`))
  }
  return orphans
}

/** Removes the files, 100 at a time; the number removed. */
export async function removeSharedPhotos(bucket: Bucket, paths: readonly string[]): Promise<number> {
  let removed = 0
  for (let i = 0; i < paths.length; i += 100) {
    const { data, error } = await bucket.remove(paths.slice(i, i + 100))
    if (error) throw new Error(`${SHARED_PHOTO_BUCKET}: ${error.message.slice(0, 200)}`)
    removed += data.length
  }
  return removed
}
