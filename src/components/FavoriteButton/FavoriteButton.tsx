'use client'

import { Heart } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { useIsFavorite } from '../../hooks/useStore'
import { toggleFavorite } from '../../lib/storage'

interface Props {
  hotelId: string
  className?: string
}

/** Heart toggle for hotel cards and the hotel page; "not saved" until hydration. */
export function FavoriteButton({ hotelId, className }: Props) {
  const saved = useIsFavorite(hotelId)
  return (
    <Button
      variant="outline"
      size="icon-sm"
      className={cn('text-primary shadow-(--shadow-card)', className)}
      aria-label={saved ? 'Убрать из избранного' : 'Добавить в избранное'}
      aria-pressed={saved}
      onClick={(event) => {
        // Cards are links: the toggle must not open the hotel.
        event.preventDefault()
        event.stopPropagation()
        toggleFavorite(hotelId)
      }}
    >
      <Heart className="size-5" fill={saved ? 'currentColor' : 'none'} strokeWidth={2} aria-hidden />
    </Button>
  )
}
