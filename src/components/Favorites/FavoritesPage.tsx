'use client'

import Link from 'next/link'
import { HotelTile } from '@/components/HotelTile/HotelTile'
import { buttonVariants } from '@/components/ui/button'
import { useHydrated } from '@/hooks/useHydrated'
import { useFavorites } from '@/hooks/useStore'
import { getHotel } from '@/lib/catalog'
import { pageClass } from '@/components/Trips/TripsGate'

function Favorites() {
  const hydrated = useHydrated()
  const hotels = useFavorites().flatMap((id) => getHotel(id) ?? [])

  if (!hydrated) return <p className="text-muted-foreground">Загружаем избранное…</p>
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
          {/* Unsetting the heart removes the hotel from this list. */}
          <HotelTile hotel={hotel} heading="h2" href={`/hotels/${hotel.id}`} />
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
