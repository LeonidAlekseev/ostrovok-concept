import { useRef, useState } from 'react'
import { MAX_PHOTOS } from '@/lib/assistant'
import { PHOTO_READ_ERROR, optimizePhoto, photoError, type OptimizedPhoto } from '@/lib/imageOptimize'

export const PHOTO_LIMIT_ERROR = `Можно приложить не больше ${MAX_PHOTOS} фото к сообщению.`

export interface AttachPhotos {
  photos: OptimizedPhoto[]
  /** The photos chosen are still being optimised. */
  busy: boolean
  /** Why a chosen file was not attached: its type, its size, the limit of `MAX_PHOTOS`. */
  error: string | null
  add: (files: Iterable<File>) => Promise<void>
  remove: (index: number) => void
  /** Empties the previews once the message is sent. */
  clear: () => void
}

/** The photos of the next message: optimised in the browser as they are chosen, at most `MAX_PHOTOS`. */
export function useAttachPhotos(): AttachPhotos {
  const [photos, setPhotos] = useState<OptimizedPhoto[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The count of the photos taken so far, the ones still optimised among them.
  const taken = useRef(0)

  const add = async (files: Iterable<File>) => {
    setError(null)
    setBusy(true)
    try {
      for (const file of files) {
        const problem = taken.current >= MAX_PHOTOS ? PHOTO_LIMIT_ERROR : photoError(file)
        if (problem) {
          setError(problem)
          if (problem === PHOTO_LIMIT_ERROR) break
          continue
        }
        taken.current += 1
        try {
          const photo = await optimizePhoto(file)
          setPhotos((list) => [...list, photo])
        } catch {
          taken.current -= 1
          setError(PHOTO_READ_ERROR)
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const remove = (index: number) => {
    taken.current -= 1
    setError(null)
    setPhotos((list) => list.filter((_, i) => i !== index))
  }

  const clear = () => {
    taken.current = 0
    setError(null)
    setPhotos([])
  }

  return { photos, busy, error, add, remove, clear }
}
