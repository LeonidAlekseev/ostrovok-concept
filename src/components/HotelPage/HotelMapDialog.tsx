'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { MapUnavailable } from '@/components/MapUnavailable/MapUnavailable'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { Hotel } from '@/lib/catalog'
import { useHotels } from '@/hooks/useHotels'
import { boxAround, boxParam, type MapBox } from '@/lib/mapBox'
import { lowestPrice } from '@/lib/offer'
import { setGuestParams, setStayParams } from '@/lib/search'
import { todayIso } from '@/lib/dates'
import type { MapCamera } from '../SearchResultsPage/searchView'
import { useHotelStay } from './stayContext'

// MapLibre is loaded only when the map opens, and only in the browser.
const SearchMap = dynamic(
  () => import('../SearchResultsPage/SearchMap').catch(() => ({ default: () => <MapUnavailable /> })),
  { ssr: false, loading: () => <div className="size-full animate-pulse bg-muted" aria-hidden /> },
)

/** The blocks around the hotel. */
const ZOOM = 15

/** The pause after a move before the hotels of the new view are asked for, ms. */
const VIEW_PAUSE_MS = 300

/**
 * The results map around one hotel, at the zoom of its blocks: the hotels in view and a margin around it with the
 * price of the page's stay, loaded box by box as the map moves (`GET /api/hotels?bbox=`) and kept once loaded; this
 * one ringed and above the rest. A marker opens that hotel with the same dates and guests.
 */
function HotelMap({ hotel }: { hotel: Hotel }) {
  const router = useRouter()
  const { stay, guests } = useHotelStay()
  // The box of the view, set a pause after the map stops; until the first one the map shows this hotel alone.
  const [box, setBox] = useState<MapBox | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const onViewChange = useCallback((view: MapBox) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const next = boxAround(view)
      setBox((current) => (current && boxParam(current) === boxParam(next) ? current : next))
    }, VIEW_PAUSE_MS)
  }, [])
  const found = useHotels(box && { bbox: box })
  // Every hotel loaded so far stays on the map.
  const [known, setKnown] = useState<ReadonlyMap<string, Hotel>>(() => new Map([[hotel.id, hotel]]))
  if (found.status === 'done' && found.hotels.some((h) => !known.has(h.id)))
    setKnown(new Map([...known, ...found.hotels.map((h) => [h.id, h] as const)]))
  const hotels = useMemo(
    () => [...known.values()].map((h) => ({ hotel: h, price: lowestPrice(h, stay, guests.rooms, todayIso()) })),
    [known, stay, guests.rooms],
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
      frame={false}
      onViewChange={onViewChange}
      fallback={<MapUnavailable />}
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
