// Finds the photos of the shared snapshots left in the public bucket with no snapshot (it was deleted with the account
// or by hand) and, with --delete, removes them:
//   npm run db:clean:shared-photos              only shows what would go: the folders and the number of files
//   npm run db:clean:shared-photos -- --delete  removes them through the Storage API
// A folder younger than an hour is left: its snapshot may be being shared right now. Needs NEXT_PUBLIC_SUPABASE_URL
// and SUPABASE_SERVICE_ROLE_KEY (.env.local); prints counts and paths, never the keys.
import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/lib/db/database.types.ts'
import {
  SHARED_PHOTO_BUCKET,
  orphanSharedPhotos,
  removeSharedPhotos,
  sharedPhotoOwners,
} from '../src/lib/sharedPhotos.ts'

const { values: options } = parseArgs({ options: { delete: { type: 'boolean', default: false } } })

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set: run npm run secrets:reveal`)
  return value
}

const supabase = createClient<Database>(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const PAGE = 1000
/** Every snapshot there is, by its owner. */
const shares = new Map<string, Set<string>>()
for (let from = 0; ; from += PAGE) {
  const { data, error } = await supabase
    .from('assistant_chat_shares')
    .select('id, user_id')
    .order('id')
    .range(from, from + PAGE - 1)
  if (error) throw new Error(`assistant_chat_shares: ${error.message}`)
  for (const { id, user_id } of data) shares.set(user_id, (shares.get(user_id) ?? new Set()).add(id))
  if (data.length < PAGE) break
}

const bucket = supabase.storage.from(SHARED_PHOTO_BUCKET)
const orphans: string[] = []
for (const userId of await sharedPhotoOwners(bucket))
  orphans.push(...(await orphanSharedPhotos(bucket, userId, shares.get(userId) ?? new Set())))

const folders = new Set(orphans.map((path) => path.split('/').slice(0, 2).join('/')))
for (const folder of folders) console.log(folder)
console.log(`${SHARED_PHOTO_BUCKET}: ${orphans.length} files in ${folders.size} folders with no snapshot`)
if (!options.delete) console.log('Nothing removed: run with -- --delete to remove them')
else console.log(`Removed ${await removeSharedPhotos(bucket, orphans)} files`)
