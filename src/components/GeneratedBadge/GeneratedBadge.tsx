import { cn } from 'cn'
import { isSyntheticHotel, type HotelSummary } from '../../lib/catalog'

/**
 * The small translucent «generated» mark of a hotel the catalogue generator made up; nothing for a real hotel.
 * Production shows no such hotels, so the mark is seen only in preview and `next dev`.
 */
export function GeneratedBadge({ hotel, className }: { hotel: Pick<HotelSummary, 'id'>; className?: string }) {
  if (!isSyntheticHotel(hotel)) return null
  return (
    <span
      className={cn(
        'pointer-events-none rounded-full bg-black/40 px-1.5 py-0.5 text-[10px]/none font-medium text-white/90 backdrop-blur-sm',
        className,
      )}
    >
      generated
    </span>
  )
}
