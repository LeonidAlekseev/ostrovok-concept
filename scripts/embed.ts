// Embeds the catalog for the semantic search: every hotel gets a vector from nvidia/nemotron-3.5-embed-1b in the `embeddings` table.
//   npm run db:embed   (Node runs the TypeScript itself; the keys come from .env.local, see README «Ключи API»)
// Only new and changed hotels go to the model (`content_hash`, which includes the model, so vectors of another model are redone); vectors of removed hotels are deleted.
// Batches of BATCH texts, at most 40 requests a minute (the NVIDIA key's limit); a 429 or a 5xx is retried with a
// pause. Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NVIDIA_API_KEY; prints counts, never the keys.
// Exits with 1 on errors.
import { embedMany } from 'ai'
import { required, serviceClient, type Table } from './lib/node.ts'

const { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, contentHash, embeddingModel, toVector } =
  await import('../src/lib/ai/embedding.ts')
const { hotelDocument } = await import('../src/lib/ai/documents.ts')
const { featuresOf, withoutDoubtfulBuildings } = await import('../src/lib/features.ts')
const {
  amenityGroupsOf,
  amenityGroupsSchema,
  nearbyOf,
  PLACE_COLUMNS,
  placeRowSchema,
  ROOM_FLOORS_COLUMNS,
  roomFloorsOf,
} = await import('../src/lib/ota/page.ts')
type DocumentDetails = import('../src/lib/ai/documents.ts').DocumentDetails
type PlaceRow = import('../src/lib/ota/page.ts').PlaceRow
const { NVIDIA_KEY, pacer, withRetry } = await import('../src/lib/ai/nvidia.ts')
const { vibeScale } = await import('../src/lib/vibe.ts')

type Destination = import('../src/data/destinations.ts').Destination
type Hotel = import('../src/lib/catalog.ts').Hotel
type FeatureRow = import('../src/lib/features.ts').FeatureRowRead
type RoomViewRow = import('../src/lib/features.ts').RoomViewRowRead

const BATCH = 32
const PAGE = 1000

const supabase = serviceClient()
const model = embeddingModel(required(NVIDIA_KEY), 'passage')
const turn = pacer()

/** Every row of `table`, page by page; `null` when the table does not exist yet. */
async function readAll<T>(
  table: Table | 'hotel_room_views_named',
  columns: string,
  orderBy = ['id'],
): Promise<T[] | null> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const query = orderBy.reduce((q, column) => q.order(column), supabase.from(table as Table).select(columns))
    const { data, error } = await query.range(from, from + PAGE - 1)
    // PGRST205: no such table in the schema cache.
    if (error?.code === 'PGRST205' || error?.code === '42P01') return null
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data as unknown as T[]))
    if (data.length < PAGE) return rows
  }
}

interface Document {
  kind: 'hotel'
  ref_id: string
  destination_id: string
  content: string
  content_hash: string
}

const destinations = ((await readAll<{ data: Destination }>('destinations', 'data')) ?? []).map((row) => row.data)
const cityOf = new Map(destinations.map((d) => [d.id, d]))
const hotels = ((await readAll<{ data: Hotel }>('hotels', 'data')) ?? []).map((row) => row.data)

// The building, the noise and the room views of `npm run db:features`; none before its migration. A building lower
// than the floors the hotel's rooms take is not the hotel's: its floors and height are left out.
const features = withoutDoubtfulBuildings(
  featuresOf(
    (await readAll<FeatureRow>(
      'hotel_features',
      'hotel_id, floors, height_m, height_source, height_lower_m, height_upper_m, floors_source, lden_min, lden_max, lnight_min, lnight_max',
      ['hotel_id'],
    )) ?? [],
    (await readAll<RoomViewRow>('hotel_room_views_named', 'hotel_id, view, room_name', [
      'hotel_id',
      'rg_hash',
      'view',
    ])) ?? [],
  ),
  roomFloorsOf(
    (await readAll<{ master_id: unknown; floors: unknown }>('ota_hotel_pages', ROOM_FLOORS_COLUMNS, ['master_id'])) ??
      [],
  ),
)

// The places and the amenities of the real hotels' Ostrovok pages (`npm run db:load:ota-pages`); none before its
// migration.
const placesOf = new Map<string, PlaceRow[]>()
for (const row of (await readAll<unknown>('ota_hotel_places' as Table, PLACE_COLUMNS, ['hotel_id', 'region_id'])) ??
  []) {
  const place = placeRowSchema.parse(row)
  placesOf.set(place.hotel_id, [...(placesOf.get(place.hotel_id) ?? []), place])
}
const details = new Map<string, DocumentDetails>(
  (
    (await readAll<{ master_id: number; groups: unknown }>(
      'ota_hotel_pages',
      'master_id, groups:hotel->amenityGroups',
      ['master_id'],
    )) ?? []
  ).map((row) => [
    `ota-${row.master_id}`,
    {
      nearby: nearbyOf(placesOf.get(`ota-${row.master_id}`) ?? []),
      amenityGroups: amenityGroupsOf({ amenityGroups: amenityGroupsSchema.parse(row.groups) }),
    },
  ]),
)

const scale = vibeScale(hotels, destinations)
const documents: Document[] = []
for (const hotel of hotels) {
  const city = cityOf.get(hotel.destinationId)
  if (!city) continue
  const content = hotelDocument(hotel, city, scale, features.get(hotel.id), details.get(hotel.id))
  documents.push({
    kind: 'hotel',
    ref_id: hotel.id,
    destination_id: city.id,
    content,
    content_hash: contentHash(content),
  })
}

const stored = (await readAll<{ kind: string; ref_id: string; content_hash: string }>(
  'embeddings',
  'kind, ref_id, content_hash',
  ['kind', 'ref_id'],
))!
const key = (row: { kind: string; ref_id: string }) => `${row.kind}:${row.ref_id}`
const storedHash = new Map(stored.map((row) => [key(row), row.content_hash]))
const todo = documents.filter((d) => storedHash.get(key(d)) !== d.content_hash)

/** The batch's vectors; each try waits its turn under the limit, a retryable error (429, 5xx, network) is tried again. */
async function embedBatch(values: string[]): Promise<number[][]> {
  return withRetry(
    async () => {
      await turn()
      const { embeddings } = await embedMany({ model, values, maxRetries: 0 })
      return embeddings
    },
    { onRetry: (message) => console.warn(`  ${message}`) },
  )
}

let embedded = 0
let errors = 0
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH)
  try {
    const vectors = await embedBatch(batch.map((d) => d.content))
    if (vectors.some((v) => v.length !== EMBEDDING_DIMENSIONS))
      throw new Error(`the model returned ${vectors[0]?.length} numbers, the table holds ${EMBEDDING_DIMENSIONS}`)
    const updatedAt = new Date().toISOString()
    const { error } = await supabase.from('embeddings').upsert(
      batch.map((d, j) => ({ ...d, model: EMBEDDING_MODEL, embedding: toVector(vectors[j]), updated_at: updatedAt })),
      { onConflict: 'kind,ref_id' },
    )
    if (error) throw new Error(error.message)
    embedded += batch.length
    console.log(`  ${embedded + errors}/${todo.length}`)
  } catch (error) {
    errors += batch.length
    console.error(`  batch ${i / BATCH + 1}: ${(error as Error).message.slice(0, 200)}`)
  }
}

// Vectors of hotels gone from the catalog.
const current = new Set(documents.map(key))
const stale = stored.filter((row) => !current.has(key(row)))
for (const row of stale) {
  const { error } = await supabase.from('embeddings').delete().eq('kind', row.kind).eq('ref_id', row.ref_id)
  if (error) throw new Error(`embeddings: ${error.message}`)
}

console.log(
  `embeddings: ${documents.length} hotels, ${embedded} embedded, ` +
    `${documents.length - todo.length} unchanged, ${errors} errors, ${stale.length} deleted`,
)
if (errors) process.exit(1)
