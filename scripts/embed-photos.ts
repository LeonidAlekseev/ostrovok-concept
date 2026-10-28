// Embeds the photos of the catalog's hotels for the search by a photo: each photo gets its vector from
// nvidia/llama-nemotron-embed-vl-1b-v2 in `hotel_photo_embeddings`, as a passage. Valencia only (`PHOTO_CITIES`).
//   npm run db:embed:photos            (--dry-run only counts: no request to the model, no write)
// Idempotent: `content_hash` (the model, the dimensions and the photo's CDN path) says which photos have their vector, so
// only the new ones go to the model; the vectors of photos no longer in the catalog are deleted. A photo without a
// `url`, of another kind of address, not WebP or JPEG, not downloaded or rejected by the model (422) is skipped and
// counted. Batches of PHOTO_BATCH photos, at most 40 requests a minute (the NVIDIA key's limit); a 429 or a 5xx is
// retried with a pause. Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NVIDIA_API_KEY; prints counts,
// never the keys. Exits with 1 on errors.
import { APICallError } from 'ai'
import { required, serviceClient } from './lib/node.ts'

const { toVector } = await import('../src/lib/ai/embedding.ts')
const { NVIDIA_KEY, pacer, withRetry } = await import('../src/lib/ai/nvidia.ts')
const { PHOTO_BATCH, PHOTO_CITIES, embedPhotos, photoContentHash, photoDataUrl, photoKey, photoUrl } =
  await import('../src/lib/ai/photoEmbedding.ts')
const { MAX_PHOTO_URL_LENGTH } = await import('../src/lib/ai/vision.ts')

const PAGE = 1000
/** The photos are downloaded at the size the vectors are made of; a catalog photo of it is far under the limit. */
const MEDIA_TYPES = new Set(['image/jpeg', 'image/webp'])

const dryRun = process.argv.includes('--dry-run')
const supabase = serviceClient()
const turn = pacer()

interface Photo {
  hotelId: string
  destinationId: string
  key: string
}

/** Every photo of the hotels of `PHOTO_CITIES`, once per hotel; `skipped` counts those without a usable address. */
async function catalogPhotos(): Promise<{ photos: Photo[]; skipped: number }> {
  const photos: Photo[] = []
  let skipped = 0
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('hotels')
      .select('id, destination_id, photos:data->photos')
      .in('destination_id', [...PHOTO_CITIES])
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`hotels: ${error.message}`)
    for (const hotel of data) {
      const seen = new Set<string>()
      const list = Array.isArray(hotel.photos) ? (hotel.photos as { url?: unknown }[]) : []
      for (const photo of list) {
        const key = typeof photo?.url === 'string' ? photoKey(photo.url) : null
        if (!key) skipped++
        else if (!seen.has(key)) {
          seen.add(key)
          photos.push({ hotelId: hotel.id, destinationId: hotel.destination_id, key })
        }
      }
    }
    if (data.length < PAGE) return { photos, skipped }
  }
}

/** The rows of the table now: `hotel_id/photo_key` → `content_hash`; `null` when there is no table yet. */
async function storedHashes(): Promise<Map<string, string> | null> {
  const stored = new Map<string, string>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('hotel_photo_embeddings')
      .select('hotel_id, photo_key, content_hash')
      .order('hotel_id')
      .order('photo_key')
      .range(from, from + PAGE - 1)
    // PGRST205: no such table in the schema cache, the migration is not applied yet.
    if (error?.code === 'PGRST205' || error?.code === '42P01') return null
    if (error) throw new Error(`hotel_photo_embeddings: ${error.message}`)
    for (const row of data) stored.set(`${row.hotel_id}/${row.photo_key}`, row.content_hash)
    if (data.length < PAGE) return stored
  }
}

/** The photo as a data URL, or `null` when the CDN does not give a WebP or JPEG of a size the model takes. */
async function download(photo: Photo): Promise<string | null> {
  try {
    const response = await fetch(photoUrl(photo.key), { signal: AbortSignal.timeout(20_000) })
    const mediaType = response.headers.get('content-type')?.split(';')[0].trim() ?? ''
    if (!response.ok || !MEDIA_TYPES.has(mediaType)) return null
    const url = photoDataUrl(await response.arrayBuffer(), mediaType)
    return url.length <= MAX_PHOTO_URL_LENGTH ? url : null
  } catch {
    return null
  }
}

const is422 = (error: unknown) => APICallError.isInstance(error) && error.statusCode === 422
const embedOnce = (apiKey: string, urls: string[]) =>
  withRetry(async () => (await turn(), embedPhotos(apiKey, urls)), {
    onRetry: (message) => console.warn(`  ${message}`),
  })

/** The vectors of `urls`; a batch the model rejects (422) is asked photo by photo, and a photo it rejects is `null`. */
async function vectors(apiKey: string, urls: string[]): Promise<(number[] | null)[]> {
  try {
    return await embedOnce(apiKey, urls)
  } catch (error) {
    if (!is422(error)) throw error
    if (urls.length === 1) return [null]
    const out: (number[] | null)[] = []
    for (const url of urls) out.push(...(await vectors(apiKey, [url])))
    return out
  }
}

const { photos, skipped } = await catalogPhotos()
const stored = await storedHashes()
if (!stored && !dryRun) throw new Error('hotel_photo_embeddings does not exist: apply the migration (npm run db:push)')
const wanted = new Set(photos.map((p) => `${p.hotelId}/${p.key}`))
const todo = photos.filter(
  (p) => (stored ?? new Map<string, string>()).get(`${p.hotelId}/${p.key}`) !== photoContentHash(p.key),
)
const orphans = [...(stored?.keys() ?? [])].filter((id) => !wanted.has(id))
const cities = PHOTO_CITIES.join(', ')
console.log(
  `photo vectors (${cities}): ${photos.length} photos, ${skipped} without a usable address, ${todo.length} to embed, ` +
    `${orphans.length} to delete`,
)
if (dryRun) process.exit(0)

let embedded = 0
let unusable = 0
let errors = 0
if (todo.length > 0) {
  const apiKey = required(NVIDIA_KEY)
  for (let i = 0; i < todo.length; i += PHOTO_BATCH) {
    const batch = todo.slice(i, i + PHOTO_BATCH)
    try {
      const urls = await Promise.all(batch.map(download))
      const usable = batch.flatMap((photo, j) => (urls[j] ? [{ photo, url: urls[j] }] : []))
      unusable += batch.length - usable.length
      if (usable.length > 0) {
        const result = await vectors(
          apiKey,
          usable.map((u) => u.url),
        )
        const rows = usable.flatMap(({ photo }, j) =>
          result[j]
            ? [
                {
                  hotel_id: photo.hotelId,
                  photo_key: photo.key,
                  destination_id: photo.destinationId,
                  content_hash: photoContentHash(photo.key),
                  embedding: toVector(result[j]),
                  updated_at: new Date().toISOString(),
                },
              ]
            : [],
        )
        unusable += usable.length - rows.length
        if (rows.length > 0) {
          const { error } = await supabase
            .from('hotel_photo_embeddings')
            .upsert(rows, { onConflict: 'hotel_id,photo_key' })
          if (error) throw new Error(error.message)
          embedded += rows.length
        }
      }
      if ((i / PHOTO_BATCH) % 25 === 24) console.log(`  ${embedded + unusable + errors}/${todo.length}`)
    } catch (error) {
      errors += batch.length
      console.error(`  batch ${i / PHOTO_BATCH + 1}: ${(error as Error).message.slice(0, 200)}`)
    }
  }
}

// The photos the catalog no longer has: by hotel, so a delete names few keys.
let deleted = 0
const byHotel = new Map<string, string[]>()
for (const id of orphans) {
  const [hotelId, ...key] = id.split('/')
  byHotel.set(hotelId, [...(byHotel.get(hotelId) ?? []), key.join('/')])
}
for (const [hotelId, keys] of byHotel) {
  const { error } = await supabase.from('hotel_photo_embeddings').delete().eq('hotel_id', hotelId).in('photo_key', keys)
  if (error) {
    errors += keys.length
    console.error(`  delete ${hotelId}: ${error.message.slice(0, 200)}`)
  } else deleted += keys.length
}

console.log(
  `photo vectors: ${embedded} embedded, ${unusable} skipped (not downloaded or rejected by the model), ${deleted} deleted, ` +
    `${photos.length - todo.length} unchanged, ${errors} errors`,
)
if (errors) process.exit(1)
