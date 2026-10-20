'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { LngLatBounds, Map as MapLibreMap, Marker, Popup, setWorkerUrl, type PopupOptions } from 'maplibre-gl'
import { Star } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import type { Hotel } from '../../lib/catalog'
import { countRu, formatDecimal, formatPrice } from '../../lib/format'
import { MapUnavailable } from './MapUnavailable'

// MapLibre looks for its worker next to its own module, which the bundler moves: point it to the file.
setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href)

/** Free vector tiles without a key; the style credits OpenFreeMap, OpenMapTiles and OpenStreetMap. */
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

/** The attribution is shown in full this long after the map loads, then folds into its "i" button. */
export const ATTRIBUTION_SHOWN_MS = 5000

export interface MapHotel {
  hotel: Hotel
  /** The price of the result card: the cheapest rate for the nights and rooms of the query, ₽. */
  price: number
}

/** Offsets of the preview from the marker's point, by the side of the preview that faces it. */
const PREVIEW_OFFSET: PopupOptions['offset'] = {
  center: [0, 0],
  top: [0, 6],
  'top-left': [0, 6],
  'top-right': [0, 6],
  bottom: [0, -40],
  'bottom-left': [0, -40],
  'bottom-right': [0, -40],
  left: [24, -18],
  right: [-24, -18],
}

interface Props {
  hotels: MapHotel[]
  activeId: string | null
  /** Hovering or focusing a marker highlights the hotel's card. */
  onActivate: (id: string | null) => void
  /** A marker press opens the hotel. */
  onOpen: (id: string) => void
}

/**
 * Folds the compact attribution into its "i" button the way pressing it does. The OSMF rules let an
 * interactive map fold it only after showing it: on the first interaction or after a few seconds.
 */
function foldAttribution(map: MapLibreMap) {
  map.getContainer().querySelector<HTMLElement>('.maplibregl-compact-show > .maplibregl-ctrl-attrib-button')?.click()
}

/**
 * MapLibre map of the results with a price marker per hotel. Markers and the hover preview are React
 * portals into the elements MapLibre positions. A failure before the style loads (offline, no WebGL)
 * shows "Карта недоступна"; the list next to the map does not depend on it.
 */
export default function SearchMap({ hotels, activeId, onActivate, onOpen }: Props) {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [failed, setFailed] = useState(false)
  // One element per hotel, created once: MapLibre moves it, React renders the marker into it.
  const [elements] = useState(() => new Map<string, HTMLElement>())
  const elementFor = (id: string) => {
    let element = elements.get(id)
    if (!element) {
      element = document.createElement('div')
      // The active marker is lifted above its neighbours.
      element.className = 'has-data-active:z-1'
      elements.set(id, element)
    }
    return element
  }
  // The preview card above a hovered or focused marker: one popup, its content rendered by React.
  const [previewElement] = useState(() => document.createElement('div'))
  const popupRef = useRef<Popup | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const previewDomId = useId()

  // A ref callback rather than an effect: the map lives exactly as long as its container.
  // MapLibre follows the container size itself (`trackResize`), redrawing in the same frame.
  const containerRef = useCallback((container: HTMLDivElement | null) => {
    if (!container) return
    let instance: MapLibreMap
    try {
      instance = new MapLibreMap({
        container,
        style: MAP_STYLE,
        center: [0, 30],
        zoom: 1,
        attributionControl: { compact: true },
      })
    } catch {
      // No WebGL.
      setFailed(true)
      return
    }
    let loaded = false
    let foldTimer: ReturnType<typeof setTimeout> | undefined
    const fold = () => {
      clearTimeout(foldTimer)
      foldAttribution(instance)
    }
    instance.on('load', () => {
      loaded = true
      setMap(instance)
      foldTimer = setTimeout(fold, ATTRIBUTION_SHOWN_MS)
      for (const type of ['mousedown', 'touchstart', 'wheel'] as const) instance.once(type, fold)
    })
    // Before the style is in, any error leaves an empty map; later tile errors only leave gaps.
    instance.on('error', () => {
      if (!loaded) setFailed(true)
    })
    return () => {
      clearTimeout(foldTimer)
      instance.remove()
    }
  }, [])

  // Markers follow the hotel list; the camera frames them.
  useEffect(() => {
    if (!map || hotels.length === 0) return
    const markers = hotels.map(({ hotel }) =>
      new Marker({ element: elements.get(hotel.id), anchor: 'bottom' }).setLngLat([hotel.lon, hotel.lat]).addTo(map),
    )
    const bounds = new LngLatBounds()
    for (const { hotel } of hotels) bounds.extend([hotel.lon, hotel.lat])
    map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 0 })
    return () => markers.forEach((marker) => marker.remove())
  }, [map, hotels, elements])

  const previewed = hotels.find(({ hotel }) => hotel.id === previewId)
  useEffect(() => {
    if (!map || !previewed) return
    const popup = (popupRef.current ??= new Popup({
      closeButton: false,
      closeOnClick: false,
      // MapLibre puts it where it fits; the marker stands above its point, about 2rem tall.
      offset: PREVIEW_OFFSET,
      maxWidth: '15rem',
      // The preview never takes the pointer, so it cannot steal the hover from its marker. MapLibre's
      // unlayered styles beat Tailwind's layers, hence the important flags.
      className:
        'pointer-events-none [&_.maplibregl-popup-content]:overflow-hidden! [&_.maplibregl-popup-content]:rounded-xl! [&_.maplibregl-popup-content]:p-0!',
    }).setDOMContent(previewElement))
    popup.setLngLat([previewed.hotel.lon, previewed.hotel.lat]).addTo(map)
    return () => {
      popup.remove()
    }
  }, [map, previewed, previewElement])

  if (failed) return <MapUnavailable />

  const show = (id: string) => {
    setPreviewId(id)
    onActivate(id)
  }
  const hide = () => {
    setPreviewId(null)
    onActivate(null)
  }

  return (
    <div ref={containerRef} className="size-full" aria-label="Карта отелей" role="region">
      {map &&
        hotels.map(({ hotel, price }) => {
          const active = hotel.id === activeId
          return createPortal(
            <button
              type="button"
              aria-label={`${hotel.name}, от ${formatPrice(price)}`}
              aria-haspopup="dialog"
              aria-describedby={previewId === hotel.id ? previewDomId : undefined}
              data-active={active || undefined}
              onClick={() => onOpen(hotel.id)}
              // Only a mouse hovers: a tap opens the hotel at once, without the preview.
              onPointerEnter={(e: PointerEvent) => e.pointerType === 'mouse' && show(hotel.id)}
              onPointerLeave={(e: PointerEvent) => e.pointerType === 'mouse' && hide()}
              onFocus={(e: FocusEvent<HTMLElement>) => e.currentTarget.matches(':focus-visible') && show(hotel.id)}
              onBlur={hide}
              onKeyDown={(e) => e.key === 'Escape' && setPreviewId(null)}
              className={cn(
                'rounded-full px-2.5 py-1 text-sm/[normal] font-[650] whitespace-nowrap shadow-(--shadow-card) transition-[background-color,color,scale] duration-150',
                active ? 'scale-110 bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-secondary',
              )}
            >
              {formatPrice(price)}
            </button>,
            elementFor(hotel.id),
            hotel.id,
          )
        })}
      {previewed && createPortal(<MapPreview id={previewDomId} {...previewed} />, previewElement)}
    </div>
  )
}

/** The short card of a hovered marker: the photo, the name, the stars, the guest rating and the price. */
function MapPreview({ id, hotel, price }: MapHotel & { id: string }) {
  return (
    <div id={id} className="flex w-60 flex-col font-sans text-foreground">
      <PhotoPlaceholder photo={hotel.photos[0]} className="aspect-[2/1] w-full" />
      <div className="flex flex-col gap-1 p-3">
        <p className="text-[15px]/[1.3] font-[650]">{hotel.name}</p>
        <span
          role="img"
          aria-label={countRu(hotel.stars, ['звезда', 'звезды', 'звёзд'])}
          className="flex gap-0.5 text-(--decor-star)"
        >
          {Array.from({ length: hotel.stars }, (_, i) => (
            <Star key={i} className="size-3.5" fill="currentColor" strokeWidth={0} aria-hidden />
          ))}
        </span>
        <div className="flex items-center gap-2 pt-1">
          <p className="mr-auto text-base font-bold whitespace-nowrap">от {formatPrice(price)}</p>
          <Badge className="bg-primary text-primary-foreground">
            <span className="sr-only">Оценка гостей </span>
            {formatDecimal(hotel.rating)}
          </Badge>
        </div>
      </div>
    </div>
  )
}
