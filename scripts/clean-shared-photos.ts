// Finds the photos of the shared snapshots left in the public bucket with no snapshot (it was deleted with the account
// or by hand) and, with --delete, removes them:
//   npm run db:clean:shared-photos              only shows what would go: the folders and the number of files
//   npm run db:clean:shared-photos -- --delete  removes them through the Storage API
// A folder younger than an hour is left: its snapshot may be being shared right now. Needs NEXT_PUBLIC_SUPABASE_URL
// and SUPABASE_SERVICE_ROLE_KEY (.env); prints counts and paths, never the keys.
import { parseArgs } from 'node:util'
import {
  SHARED_PHOTO_BUCKET,
  orphanSharedPhotos,
  removeSharedPhotos,
  sharedPhotoOwners,
} from '../src/lib/sharedPhotos.ts'
import { serviceClient } from './lib/node.ts'

const { values: options } = parseArgs({ options: { delete: { type: 'boolean', default: false } } })

const supabase = serviceClient()

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
