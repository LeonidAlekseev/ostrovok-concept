import Image from 'next/image'
import { useState } from 'react'
import { ImageIcon, X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { Attachment } from '../../lib/assistantChats'
import type { OptimizedPhoto } from '../../lib/imageOptimize'

/**
 * What shows a photo of a message: by default a thumbnail (the preview is enough), `'full'` for the large view (the
 * photo itself, the preview only while it is the only copy). A shared chat has only the public links and the previews.
 */
export type PhotoUrl = (attachment: Attachment, size?: 'full') => string | undefined

const tileClass =
  'relative block size-[clamp(72px,20vw,112px)] flex-none overflow-hidden rounded-2xl bg-muted shadow-[0_1px_3px_color-mix(in_srgb,var(--shadow-color)_10%,transparent)]'

/**
 * The photos of the traveller's message: thumbnails at the end of the feed's row, each opens large. A photo whose
 * file is gone (the guest's storage overflowed, the account's copy failed) reads «Фото».
 */
export function MessagePhotos({ attachments, photoUrl }: { attachments: readonly Attachment[]; photoUrl: PhotoUrl }) {
  const [open, setOpen] = useState<number | null>(null)
  const shown = open === null ? undefined : photoUrl(attachments[open], 'full')
  return (
    <>
      <ul aria-label="Фото" className="flex flex-wrap justify-end gap-1.5">
        {attachments.map((attachment, i) => {
          const url = photoUrl(attachment)
          return (
            <li key={attachment.path ?? attachment.url ?? i}>
              {url ? (
                <button
                  type="button"
                  className={`${tileClass} focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring`}
                  aria-label={`Открыть фото ${i + 1}`}
                  onClick={() => setOpen(i)}
                >
                  <Image
                    src={url}
                    alt=""
                    width={attachment.width}
                    height={attachment.height}
                    unoptimized
                    className="size-full object-cover"
                  />
                </button>
              ) : (
                <span
                  className={`${tileClass} grid place-items-center text-xs text-muted-foreground`}
                  aria-label="Фото недоступно"
                >
                  <span className="flex flex-col items-center gap-1">
                    <ImageIcon className="size-5" aria-hidden />
                    Фото
                  </span>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="w-auto max-w-[min(96vw,1100px)] gap-0 bg-transparent p-0 ring-0 sm:max-w-[min(96vw,1100px)]">
          <DialogTitle className="sr-only">Фото {open === null ? '' : open + 1}</DialogTitle>
          {shown && open !== null && (
            <Image
              src={shown}
              alt={`Фото ${open + 1}`}
              width={attachments[open].width}
              height={attachments[open].height}
              unoptimized
              className="h-auto max-h-[86dvh] w-auto max-w-full rounded-xl object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** The photos of the next message over the field, each with its «Убрать». */
export function AttachedPhotos({
  photos,
  onRemove,
}: {
  photos: readonly OptimizedPhoto[]
  onRemove: (index: number) => void
}) {
  if (photos.length === 0) return null
  return (
    <ul aria-label="Приложенные фото" className="flex gap-2 overflow-x-auto px-1 pt-1 [scrollbar-width:none]">
      {photos.map((photo, i) => (
        <li key={photo.preview.slice(-32) + i} className="relative flex-none">
          <Image
            src={photo.preview}
            alt={`Фото ${i + 1}`}
            width={photo.width}
            height={photo.height}
            unoptimized
            className="size-16 rounded-xl object-cover shadow-[0_1px_3px_color-mix(in_srgb,var(--shadow-color)_12%,transparent)]"
          />
          <button
            type="button"
            className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-foreground text-background shadow-sm hover:bg-destructive focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            aria-label={`Убрать фото ${i + 1}`}
            onClick={() => onRemove(i)}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  )
}
