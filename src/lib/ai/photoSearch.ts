import 'server-only'
import { isVisibleHotel } from '@/lib/catalog'
import { loadHiddenHotelIds } from '@/lib/db/catalog'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSecret } from '../secrets'
import { NVIDIA_KEY } from './nvidia'
import { embedPhotos, isPhotoDataUrl, PHOTO_CITIES } from './photoEmbedding'
import {
  database,
  SEMANTIC_TIMEOUT_MS,
  warn,
  type SemanticFailure,
  type SemanticHit,
  type SemanticResult,
} from './semantic'

/**
 * Search of the hotels by the traveller's photos: the photos' vectors, the nearest catalog photos in pgvector
 * (`match_hotel_photos`), each hotel by its nearest photo. The vectors of the catalog's photos exist for the cities
 * in `PHOTO_CITIES` only (photoEmbedding.ts). Same result as the search by words: «found», «nothing found», or a failure with its reason.
 */

/** Most hotels one search returns. */
const MAX_HITS = 12

export interface PhotoSearchOptions {
  /** Hotels to return. */
  k?: number
  /** The search's own limit; the caller lowers it to fit its answer in time. */
  timeoutMs?: number
  signal?: AbortSignal
}

const failed = (reason: SemanticFailure): SemanticResult => ({ status: 'failed', reason })

/**
 * The `k` hotels shown (`isVisibleHotel`, not outside the noise maps) whose photos are nearest to any of `photos`
 * (data URLs of WebP or JPEG, at most four), best first. A photo of another kind is untrusted input: it fails the
 * search without a request to the model.
 */
export async function searchHotelsByPhotos(
  photos: readonly string[],
  { k = 5, timeoutMs = SEMANTIC_TIMEOUT_MS, signal }: PhotoSearchOptions = {},
): Promise<SemanticResult> {
  if (photos.length === 0 || !photos.every(isPhotoDataUrl)) return failed('model')
  if (!isSupabaseConfigured) return failed('database')
  const apiKey = await getSecret(NVIDIA_KEY)
  if (!apiKey) return failed('no-key')
  const timeout = AbortSignal.timeout(timeoutMs)
  const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  const reasonOf = (stage: 'model' | 'database'): SemanticFailure =>
    signal?.aborted ? 'aborted' : timeout.aborted ? 'timeout' : stage

  let stage: 'model' | 'database' = 'model'
  const best = new Map<string, SemanticHit>()
  try {
    const vectors = await embedPhotos(apiKey, photos, { abortSignal })
    stage = 'database'
    const hidden = loadHiddenHotelIds()
    const db = database()
    const answers = await Promise.all(
      vectors.map((vector) =>
        db
          .rpc('match_hotel_photos', {
            query_embedding: `[${vector.join(',')}]`,
            destination_ids: [...PHOTO_CITIES],
            match_count: MAX_HITS,
          })
          .abortSignal(abortSignal),
      ),
    )
    const outside = await hidden
    for (const { data, error } of answers) {
      if (error) throw new Error(error.message)
      for (const row of data ?? []) {
        if (!isVisibleHotel({ id: row.hotel_id }) || outside.has(row.hotel_id)) continue
        const known = best.get(row.hotel_id)
        if (!known || row.similarity > known.score)
          best.set(row.hotel_id, { id: row.hotel_id, destinationId: row.destination_id, score: row.similarity })
      }
    }
  } catch (error) {
    warn('no photo vectors, using the description', error)
    return failed(reasonOf(stage))
  }
  const hits = [...best.values()].toSorted((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, k)
  return hits.length > 0 ? { status: 'found', hits } : { status: 'empty' }
}
