'use client'

import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { similarHotelScores } from '@/app/trip/actions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useHotels } from '@/hooks/useHotels'
import { useBookings, useFavorites } from '@/hooks/useStore'
import { hasStars, STAY_TYPES, type Hotel } from '@/lib/catalog'
import { countRu, formatDecimal, formatPrice } from '@/lib/format'
import { rankHotelAlternatives } from '@/lib/hotelAlternatives'
import type { RoutePlan } from '@/lib/routes'
import { replaceHotel, stayPrice, tripPlan, type TripData } from '@/lib/trip'

/** The list shows this many of the most alike hotels. */
const SHOWN = 12

const nightForms: [string, string, string] = ['ночь', 'ночи', 'ночей']

/** «+1 200 ₽», «−1 800 ₽», «та же цена». */
const priceDifference = (difference: number) =>
  difference === 0 ? 'та же цена' : `${difference > 0 ? '+' : '−'}${formatPrice(Math.abs(difference))}`

/**
 * How well the city's hotels suit the traveller (the plan's hotels, the favourites and the bookings), by the
 * embeddings; `undefined` while loading, `null` without them.
 */
function useProfileScores(hotelId: string | undefined, trip: TripData) {
  const favorites = useFavorites()
  const bookings = useBookings()
  const [state, setState] = useState<{ key: string; scores: Record<string, number> | null } | null>(null)
  useEffect(() => {
    if (!hotelId) return
    let current = true
    const profile = [...trip.stops.map((stop) => stop.hotelId), ...favorites, ...bookings.map((b) => b.hotelId)]
    similarHotelScores(hotelId, profile).then(
      (scores) => current && setState({ key: hotelId, scores }),
      () => current && setState({ key: hotelId, scores: null }),
    )
    return () => {
      current = false
    }
    // Once per opening of a hotel: the profile does not change while the dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId])
  return hotelId && state?.key === hotelId ? state.scores : undefined
}

interface Props {
  trip: TripData
  plan: RoutePlan
  hotels: Readonly<Record<string, Hotel>>
  /** The stop whose hotel is replaced; `null` keeps the dialog closed. */
  stop: number | null
  onClose: () => void
  onPick: (hotel: Hotel) => void
}

/**
 * «Заменить отель»: the hotels of the stop's city, the most alike first (`rankHotelAlternatives`, leaning to the
 * traveller's taste by the embeddings when they are there), each with
 * its price for the stop's nights and how the main costs change with it (the transfers to it included).
 */
export function HotelSwapDialog({ trip, plan, hotels, stop, onClose, onPick }: Props) {
  const stay = stop === null ? undefined : plan.stays[stop]
  const loaded = useHotels(stay ? { destinations: [stay.hotel.destinationId] } : null)
  const scores = useProfileScores(stay?.hotel.id, trip)
  const profile = scores ? (hotel: Hotel) => scores[hotel.id] ?? 0 : undefined
  const ranked =
    stay && loaded.status === 'done' && scores !== undefined
      ? rankHotelAlternatives(stay.hotel, loaded.hotels, profile, new Set(plan.stays.map((s) => s.hotel.id))).slice(
          0,
          SHOWN,
        )
      : []
  const waiting = stay && (loaded.status === 'loading' || (loaded.status === 'done' && scores === undefined))

  return (
    <Dialog open={stay !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[min(44rem,calc(100dvh-2rem))] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-heading font-bold">Заменить отель</DialogTitle>
          {stay && (
            <DialogDescription>
              Вместо «{stay.hotel.name}» на {countRu(stay.nights, nightForms)}: сначала самые похожие по типу, звёздам,
              рейтингу, цене, удобствам и расстоянию до центра.
            </DialogDescription>
          )}
        </DialogHeader>
        {waiting && <p className="text-muted-foreground">Подбираем отели…</p>}
        {loaded.status === 'error' && <p role="alert">{loaded.message}</p>}
        {stay && loaded.status === 'done' && ranked.length === 0 && (
          <p className="text-muted-foreground">Других отелей в этом городе нет.</p>
        )}
        {stay && ranked.length > 0 && (
          <ul aria-label="Отели на замену" className="-mx-1 flex min-h-0 flex-col gap-2 overflow-y-auto px-1">
            {ranked.map((hotel) => {
              const price = stayPrice(hotel, stay.checkIn, stay.checkOut)
              const main = tripPlan(replaceHotel(trip, stay.stop, hotel.id), { ...hotels, [hotel.id]: hotel }).main
              return (
                <li key={hotel.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border p-3">
                  <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
                    <p className="font-semibold">{hotel.name}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                      <span>{STAY_TYPES[hotel.stayType]}</span>
                      {hasStars(hotel.stayType) && (
                        <span className="inline-flex items-center gap-0.5">
                          {hotel.stars}
                          <Star aria-label="звёзд" className="size-3.5 fill-current" />
                        </span>
                      )}
                      <span>рейтинг {formatDecimal(hotel.rating)}</span>
                      <span>{formatDecimal(hotel.distanceKm)} км до центра</span>
                    </p>
                    <p className="text-sm">
                      <span className="font-semibold">{formatPrice(price)}</span> за {countRu(stay.nights, nightForms)}{' '}
                      ·{' '}
                      <span data-testid="price-difference" className="font-semibold">
                        {priceDifference(main - plan.main)}
                      </span>{' '}
                      к основным
                    </p>
                  </div>
                  <Button size="sm" aria-label={`Выбрать ${hotel.name}`} onClick={() => onPick(hotel)}>
                    Выбрать
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
