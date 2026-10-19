'use client'

import Link from 'next/link'
import { Star } from 'lucide-react'
import { FavoriteButton } from '@/components/FavoriteButton/FavoriteButton'
import { buttonVariants } from '@/components/ui/button'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import { useHydrated } from '@/hooks/useHydrated'
import { useFavorites } from '@/hooks/useStore'
import { getDestination, getHotel } from '@/lib/catalog'
import { countRu, formatPrice } from '@/lib/format'
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
        <li key={hotel.id} className="relative">
          <Link
            href={`/hotels/${hotel.id}`}
            className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-muted"
          >
            <PhotoPlaceholder photo={hotel.photos[0]} className="h-40" />
            <div className="flex flex-col gap-1 p-4">
              <h2 className="text-heading font-bold">{hotel.name}</h2>
              <p className="text-muted-foreground">{getDestination(hotel.destinationId)?.name}</p>
              <p className="flex items-center gap-2">
                <span
                  className="flex items-center gap-0.5"
                  role="img"
                  aria-label={countRu(hotel.stars, ['звезда', 'звезды', 'звёзд'])}
                >
                  {Array.from({ length: hotel.stars }, (_, i) => (
                    <Star key={i} className="size-4 fill-current text-brand-foreground" aria-hidden />
                  ))}
                </span>
                <b>{hotel.rating.toFixed(1)}</b>
              </p>
              <p>
                от <b>{formatPrice(hotel.priceFrom)}</b> за ночь
              </p>
            </div>
          </Link>
          <FavoriteButton hotelId={hotel.id} className="absolute top-3 right-3 bg-card" />
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
