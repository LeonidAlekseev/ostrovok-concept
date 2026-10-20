import { BedDouble, Building2 } from 'lucide-react'
import { cn } from 'cn'
import type { Photo } from '@/lib/catalog'

// One gradient per catalogue tone (PHOTO_TONE_COUNT), from the palette tokens.
const tones = [
  '[background:linear-gradient(135deg,var(--decor-photo-from),var(--decor-photo-to))]',
  '[background:linear-gradient(135deg,var(--decor-hotel-from),var(--decor-hotel-to))]',
  '[background:linear-gradient(135deg,var(--decor-violet),var(--decor-machine-indigo))]',
  '[background:linear-gradient(135deg,var(--decor-trail),var(--decor-badge-green))]',
]

interface Props {
  photo: Photo
  /** Hotel views get a building, rooms a bed. */
  kind?: 'hotel' | 'room'
  className?: string
}

/** The demo has no hotel photos: a tinted tile with an icon and the caption stands in. */
export function PhotoPlaceholder({ photo, kind = 'hotel', className }: Props) {
  const Icon = kind === 'room' ? BedDouble : Building2
  return (
    <span
      role="img"
      aria-label={photo.caption}
      className={cn(
        '@container flex flex-col items-center justify-center gap-2 text-sm font-medium text-(--decor-light)',
        tones[photo.tone % tones.length],
        className,
      )}
    >
      <Icon className="size-8 opacity-80" strokeWidth={1.6} aria-hidden />
      {/* One truncated line; hidden when the tile is too narrow for even that. */}
      <span aria-hidden className="hidden max-w-full truncate @[4rem]:block">
        {photo.caption}
      </span>
    </span>
  )
}
