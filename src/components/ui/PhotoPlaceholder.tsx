import { BedDouble, Building2 } from 'lucide-react'
import { cn } from 'cn'
import type { Photo } from '@/lib/catalog'
import { ostrovokImage } from '@/lib/ota/image'

// One gradient per catalogue tone (PHOTO_TONE_COUNT), from the palette tokens.
const tones = [
  '[background:linear-gradient(135deg,var(--decor-photo-from),var(--decor-photo-to))]',
  '[background:linear-gradient(135deg,var(--decor-hotel-from),var(--decor-hotel-to))]',
  '[background:linear-gradient(135deg,var(--decor-violet),var(--decor-indigo))]',
  '[background:linear-gradient(135deg,var(--decor-trail),var(--decor-badge-green))]',
]

interface Props {
  photo: Photo
  /** Hotel views get a building, rooms a bed. */
  kind?: 'hotel' | 'room'
  className?: string
  /** The gallery's size of a real photo; cards and thumbnails get the small one. */
  large?: boolean
}

/**
 * A hotel photo: a tinted tile with an icon and the caption, and the real image over it when the photo has one.
 * The demo hotels have no images; a real one that fails to load leaves the tile (the image has an empty alt).
 */
export function PhotoPlaceholder({ photo, kind = 'hotel', className, large = false }: Props) {
  const Icon = kind === 'room' ? BedDouble : Building2
  return (
    <span
      role="img"
      aria-label={photo.caption}
      className={cn(
        '@container relative flex flex-col items-center justify-center gap-2 overflow-hidden text-sm font-medium text-(--decor-light)',
        tones[photo.tone % tones.length],
        className,
      )}
    >
      <Icon className="size-8 opacity-80" strokeWidth={1.6} aria-hidden />
      {/* One truncated line; hidden when the tile is too narrow for even that. */}
      <span aria-hidden className="hidden max-w-full truncate @[4rem]:block">
        {photo.caption}
      </span>
      {/* After the icon and the caption: the image covers them. */}
      {photo.url && (
        <img
          src={ostrovokImage(photo.url, large ? '1024x768' : '640x400')}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  )
}
