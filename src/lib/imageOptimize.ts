/**
 * The traveller's photos for the chat, optimised in the browser before they go anywhere: up to 1600 px on the long
 * side in WebP for the model and the account, and a preview of 320 px for the feed and a guest's storage. The
 * original file is never sent. A browser that cannot encode WebP (older Safari) gives JPEG.
 */

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
/** The original file's limit. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024
export const PHOTO_SIDE = 1600
export const PREVIEW_SIDE = 320
const QUALITY = 0.8
/** A photo heavier than this is encoded again, coarser: four of them stay well within the route's body. */
const MAX_ENCODED_BYTES = 700_000
const COARSE_QUALITY = 0.6

export const PHOTO_TYPE_ERROR = 'Можно приложить только фото в JPEG, PNG или WebP.'
export const PHOTO_SIZE_ERROR = 'Фото больше 10 МБ — выберите поменьше.'
export const PHOTO_READ_ERROR = 'Не получилось открыть фото — попробуйте другое.'

export interface OptimizedPhoto {
  /** The data URL of the photo of `PHOTO_SIDE`. */
  photo: string
  /** The data URL of the preview of `PREVIEW_SIDE`. */
  preview: string
  /** The size of `photo`. */
  width: number
  height: number
}

/** Why the file cannot be attached, or `null` when it can. */
export function photoError(file: Pick<File, 'type' | 'size'>): string | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return PHOTO_TYPE_ERROR
  if (file.size > MAX_PHOTO_BYTES) return PHOTO_SIZE_ERROR
  return null
}

/** The size within `side` on the long side, keeping the proportions; a smaller picture is not enlarged. */
export function fitSize(width: number, height: number, side: number): { width: number; height: number } {
  const scale = Math.min(1, side / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The photo was not encoded'))), type, quality),
  )

/** The blob as a `data:` URL, the form the chat keeps its photos in. */
export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

/** The picture of `side` in WebP (JPEG where WebP is not encoded), coarser when it comes out too heavy. */
async function encode(bitmap: ImageBitmap, side: number) {
  const { width, height } = fitSize(bitmap.width, bitmap.height, side)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No canvas')
  // A transparent PNG gets a white ground, as JPEG would anyway.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  let blob = await toBlob(canvas, 'image/webp', QUALITY)
  // A browser without the WebP encoder gives PNG instead.
  const type = blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
  if (type !== blob.type) blob = await toBlob(canvas, type, QUALITY)
  if (blob.size > MAX_ENCODED_BYTES) blob = await toBlob(canvas, type, COARSE_QUALITY)
  return { url: await blobToDataUrl(blob), width, height }
}

/** The photo and its preview; throws when the file is not a picture the browser can open. */
export async function optimizePhoto(file: Blob): Promise<OptimizedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const photo = await encode(bitmap, PHOTO_SIDE)
    const preview = await encode(bitmap, PREVIEW_SIDE)
    return { photo: photo.url, preview: preview.url, width: photo.width, height: photo.height }
  } finally {
    bitmap.close()
  }
}
