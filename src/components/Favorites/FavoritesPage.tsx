'use client'

import { useState } from 'react'
import Link from 'next/link'
import { HotelTile } from '@/components/HotelTile/HotelTile'
import { buttonVariants } from '@/components/ui/button'
import { useHotels } from '@/hooks/useHotels'
import { useHydrated } from '@/hooks/useHydrated'
import { useFavorites } from '@/hooks/useStore'
import { useToday } from '@/hooks/useToday'
import { setStayParams, startStay } from '@/lib/search'
import { pageClass } from '@/components/Trips/TripsGate'

function Favorites() {
  const hydrated = useHydrated()
  const favorites = useFavorites()
  // The loaded set grows only: an unset heart hides its hotel without loading the rest again.
  const [requested, setRequested] = useState(favorites)
  if (favorites.some((id) => !requested.includes(id))) setRequested(favorites)
  const loaded = useHotels(hydrated ? { ids: requested } : null)
  const stay = startStay(useToday())

  if (loaded.status === 'error') return <p role="alert">{loaded.message}. Обновите страницу.</p>
  if (!hydrated || loaded.status === 'loading') return <p className="text-muted-foreground">Загружаем избранное…</p>
  const hotels = favorites.flatMap((id) => loaded.hotels.find((h) => h.id === id) ?? [])
  if (hotels.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-lg font-semibold">В избранном пока пусто</p>
        <p className="text-muted-foreground">Нажмите на сердечко у отеля, чтобы сохранить его здесь.</p>
        <Link className={buttonVariants()} href="/">
          Найти отель
        </Link>
      </div>
    )
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {hotels.map((hotel) => (
        <li key={hotel.id}>
          {/* Unsetting the heart removes the hotel from this list; without a date, the link has no stay. */}
          <HotelTile
            hotel={hotel}
            heading="h2"
            href={stay ? `/hotels/${hotel.id}?${setStayParams(new URLSearchParams(), stay)}` : `/hotels/${hotel.id}`}
          />
        </li>
      ))}
    </ul>
  )
}

/** `/favorites`: saved hotels; works without signing in. */
export function FavoritesPage() {
  return (
    <main className={pageClass}>
      <h1 className="text-title font-bold tracking-[-0.02em]">Избранное</h1>
      <Favorites />
    </main>
  )
}
