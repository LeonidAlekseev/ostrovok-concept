'use client'

import { useMemo, type ReactElement } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { Hotel } from '@/lib/catalog'
import { useHotels } from '@/hooks/useHotels'
import { lowestPrice } from '@/lib/offer'
import { setGuestParams, setStayParams } from '@/lib/search'
import { todayIso } from '@/lib/dates'
import type { MapCamera } from '../SearchResultsPage/searchView'
import { HotelMapUnavailable } from './HotelMapUnavailable'
import { useHotelStay } from './stayContext'

// MapLibre is loaded only when the map opens, and only in the browser.
const SearchMap = dynamic(
  () => import('../SearchResultsPage/SearchMap').catch(() => ({ default: () => <HotelMapUnavailable /> })),
  { ssr: false, loading: () => <div className="size-full animate-pulse bg-muted" aria-hidden /> },
)

/** The streets around the hotel and the neighbouring hotels of the city. */
const ZOOM = 12

/**
 * The results map around one hotel: the hotels of its city with the price of the page's stay, this one
 * ringed and above the rest. A marker opens that hotel with the same dates and guests.
 */
function HotelMap({ hotel }: { hotel: Hotel }) {
  const router = useRouter()
  const { stay, guests } = useHotelStay()
  // The neighbours are loaded when the map opens; until then, or without them, the map shows this hotel alone.
  const city = useHotels({ destinations: [hotel.destinationId] })
  const hotels = useMemo(
    () =>
      (city.status === 'done' ? city.hotels : [hotel]).map((h) => ({
        hotel: h,
        price: lowestPrice(h, stay, guests.rooms, todayIso()),
      })),
    [city, hotel, stay, guests.rooms],
  )
  const camera = useMemo<MapCamera>(() => ({ center: [hotel.lon, hotel.lat], zoom: ZOOM }), [hotel.lon, hotel.lat])

  const open = (id: string) => {
    if (id === hotel.id) return
    const params = stay ? setStayParams(new URLSearchParams(), stay) : setGuestParams(new URLSearchParams(), guests)
    router.push(`/hotels/${id}?${params}`)
  }

  return (
    <SearchMap
      hotels={hotels}
      activeId={null}
      currentId={hotel.id}
      onOpen={open}
      initialCamera={camera}
      fallback={<HotelMapUnavailable />}
    />
  )
}

/**
 * The map of the results around this hotel in a dialog, opened by `trigger` (the map preview, "Показать на
 * карте"); it closes with the cross or Escape.
 */
export function HotelMapDialog({ hotel, trigger }: { hotel: Hotel; trigger: ReactElement }) {
  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="gap-3 text-base sm:max-w-2xl">
        <DialogTitle className="pr-8 text-lg">{hotel.name}</DialogTitle>
        <DialogDescription>{hotel.address}</DialogDescription>
        <div className="h-[min(60dvh,28rem)] overflow-hidden rounded-lg">
          <HotelMap hotel={hotel} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
