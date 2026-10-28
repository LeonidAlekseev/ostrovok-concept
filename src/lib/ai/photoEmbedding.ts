import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { truncate } from './embedding'
import { NVIDIA_BASE_URL, postNvidia } from './nvidia'
import { MAX_PHOTO_URL_LENGTH, PHOTO_DATA_URL } from './vision'

/**
 * The vectors of photos (supabase/migrations/*_hotel_photo_embeddings.sql). The model puts a photo and a text in one
 * space; a photo is embedded as a `passage` both in the catalog and as the traveller's query, the way the quality was
 * measured (a photo against another photo of its hotel). Shared by the server and by `npm run db:embed:photos`: the
 * caller brings the key, which never leaves the server.
 */

export const PHOTO_EMBEDDING_MODEL = 'nvidia/llama-nemotron-embed-vl-1b-v2'
/** The model gives 2048 numbers, the table's column is `halfvec(2048)`. */
export const PHOTO_EMBEDDING_DIMENSIONS = 2048
/** The cities whose photos have vectors (`npm run db:embed:photos`). */
export const PHOTO_CITIES: readonly string[] = ['valencia']
/** Most photos in one request: more come back 422 now and then. */
export const PHOTO_BATCH = 4
const PHOTO_EMBEDDING_URL = `${NVIDIA_BASE_URL}/embeddings`

const responseSchema = z.object({
  data: z.array(z.object({ index: z.number().int().nonnegative().optional(), embedding: z.array(z.number()) })),
})

/** A photo that is a data URL of WebP or JPEG within the size the route accepts; nothing else goes to the model. */
export const isPhotoDataUrl = (photo: string): boolean =>
  photo.length <= MAX_PHOTO_URL_LENGTH && PHOTO_DATA_URL.test(photo)

/** The photo's data URL as a photo of the catalog is sent: its bytes and the media type the CDN answered. */
export const photoDataUrl = (bytes: ArrayBuffer, mediaType: string): string =>
  `data:${mediaType};base64,${Buffer.from(bytes).toString('base64')}`

/**
 * What a catalog photo is called in the table: its path on the CDN without the host and the size
 * (`…/t/{size}/content/ab/cd/ef.JPEG` → `content/ab/cd/ef.JPEG`); `null` for an address of another kind.
 */
export function photoKey(url: string): string | null {
  const path = /^https:\/\/cdn\.ostrovok\.ru\/t\/(?:\{size\}|[0-9x]+)\/(content\/[\w/.-]+)$/.exec(url)
  return path ? path[1] : null
}

/** The catalog photo `key` at the size the vectors are made of. */
export const photoUrl = (key: string, size = '640x400') => `https://cdn.ostrovok.ru/t/${size}/${key}`

/**
 * What `hotel_photo_embeddings.content_hash` holds: the model and the dimensions go in with the key, so a vector made
 * by another model counts as new and `npm run db:embed:photos` embeds it again.
 */
export const photoContentHash = (key: string) =>
  createHash('sha256').update(`${PHOTO_EMBEDDING_MODEL}\n${PHOTO_EMBEDDING_DIMENSIONS}\n${key}`).digest('hex')

/**
 * The vectors of `photos` (data URLs, at most `PHOTO_BATCH`), 2048 numbers of length 1 each, in the order of the
 * photos. Throws on a photo of another kind (before any request), a model error (an `APICallError`: 422 when it
 * rejects a photo) or an answer of the wrong shape.
 */
export async function embedPhotos(
  apiKey: string,
  photos: readonly string[],
  { abortSignal }: { abortSignal?: AbortSignal } = {},
): Promise<number[][]> {
  if (photos.length === 0 || photos.length > PHOTO_BATCH) throw new Error(`photos: 1–${PHOTO_BATCH} at a time`)
  if (!photos.every(isPhotoDataUrl)) throw new Error('photos: only WebP or JPEG data URLs of a reasonable size')
  const { value } = await postNvidia(
    PHOTO_EMBEDDING_URL,
    apiKey,
    { model: PHOTO_EMBEDDING_MODEL, input: photos, input_type: 'passage', encoding_format: 'float' },
    { abortSignal },
  )
  const { data } = responseSchema.parse(value)
  const ordered = data.every((d) => d.index !== undefined) ? data.toSorted((a, b) => a.index! - b.index!) : data
  const vectors = ordered.map((d) => truncate(d.embedding, PHOTO_EMBEDDING_DIMENSIONS))
  if (vectors.length !== photos.length || vectors.some((v) => v.length !== PHOTO_EMBEDDING_DIMENSIONS))
    throw new Error(`the model returned ${vectors.length} vectors of ${vectors[0]?.length} numbers`)
  return vectors
}
