'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import type { Hotel } from '@/lib/catalog'
import { FavoriteButton } from '../FavoriteButton/FavoriteButton'
import { HOTEL_TITLE_ID } from './HotelHeader'
import { ShareButton } from './ShareButton'

/**
 * Below `lg`, once the name scrolls away: the compact header stuck to the top, "Назад", the name in one line,
 * the favourite and "Поделиться"; the tabs stick under it. "Назад" returns to the previous page, without
 * history to the search.
 */
export function MobileTopBar({ hotel }: { hotel: Hotel }) {
  const router = useRouter()
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const title = document.getElementById(HOTEL_TITLE_ID)
    if (!title || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) =>
      setShown(!entry.isIntersecting && entry.boundingClientRect.bottom < 0),
    )
    observer.observe(title)
    return () => observer.disconnect()
  }, [])

  const back = () => {
    if (window.history.length > 1) router.back()
    else router.push('/search')
  }

  return (
    <div
      inert={!shown}
      className={cn(
        'fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-2 bg-(--decor-surface-soft) px-[calc(var(--page-x)-8px)] transition-[translate,opacity] duration-200 lg:hidden',
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-full opacity-0',
      )}
    >
      <Button variant="ghost" size="icon-sm" aria-label="Назад" onClick={back}>
        <ChevronLeft className="size-6" aria-hidden />
      </Button>
      <p className="min-w-0 flex-1 truncate text-center text-base font-semibold" aria-hidden>
        {hotel.name}
      </p>
      <FavoriteButton hotelId={hotel.id} className="shadow-none" />
      <ShareButton hotel={hotel} className="shadow-none" />
    </div>
  )
}
