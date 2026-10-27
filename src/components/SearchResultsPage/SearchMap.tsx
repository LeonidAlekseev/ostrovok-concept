'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { LngLatBounds, Map as MapLibreMap, Marker, Popup, type PopupOptions } from 'maplibre-gl'
import { Star } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import { hasStars, isRated, type Hotel } from '../../lib/catalog'
import { countRu, formatDecimal, formatPrice } from '../../lib/format'
import { clusterPoints, expansionZoom, type MapCluster } from '../../lib/mapClusters'
import {
  ATTRIBUTION_CLASS,
  ATTRIBUTION_SHOWN_MS,
  foldAttribution,
  MAP_ATTRIBUTION,
  MAP_STYLE,
  silenceSourceAttribution,
} from './mapSetup'
import { MapUnavailable } from './MapUnavailable'
import type { MapCamera } from './searchView'

export interface MapHotel {
  hotel: Hotel
  /** The price of the result card: the cheapest rate for the stay and rooms of the query, ₽. */
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
  onActivate?: (id: string | null) => void
  /** The hotel the map is opened from: its marker is ringed, stands above the rest and joins no group. */
  currentId?: string
  /** Stands in for the map when it cannot load. */
  fallback?: ReactNode
  /** A marker press opens the hotel. */
  onOpen: (id: string) => void
  /** The camera to start with instead of framing the hotels: the one the user left the map with. */
  initialCamera?: MapCamera | null
  /** Called after every move of the map. */
  onCameraChange?: (camera: MapCamera) => void
}

/**
 * MapLibre map of the results with a price marker per hotel; markers that would stand close at the
 * current zoom share one group marker, which zooms in when pressed. Markers and the hover preview are React
 * portals into the elements MapLibre positions. A failure before the style loads (offline, no WebGL)
 * shows "Карта недоступна"; the list next to the map does not depend on it.
 */
export default function SearchMap({
  hotels,
  activeId,
  onActivate,
  currentId,
  fallback = <MapUnavailable />,
  onOpen,
  initialCamera,
  onCameraChange,
}: Props) {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [failed, setFailed] = useState(false)
  // The zoom the groups are made for: it changes once a zoom ends, so markers do not regroup mid-gesture.
  const [zoom, setZoom] = useState<number | null>(null)
  const clusters = useMemo(() => {
    if (zoom === null) return []
    const grouped = clusterPoints(
      hotels.filter(({ hotel }) => hotel.id !== currentId),
      zoom,
    )
    // The current hotel is last: its marker is added last and so stands above the rest.
    const current = hotels.find(({ hotel }) => hotel.id === currentId)
    if (!current) return grouped
    const { hotel, price } = current
    const own: MapCluster<MapHotel> = { key: hotel.id, members: [current], lon: hotel.lon, lat: hotel.lat, price }
    return [...grouped, own]
  }, [hotels, zoom, currentId])
  // One element per marker, created once: MapLibre moves it, React renders the marker into it.
  const [elements] = useState(() => new Map<string, HTMLElement>())
  const elementFor = (key: string) => {
    let element = elements.get(key)
    if (!element) {
      element = document.createElement('div')
      // The active marker is lifted above its neighbours.
      element.className = 'has-data-active:z-1 has-data-current:z-2'
      elements.set(key, element)
    }
    return element
  }
  // The camera to start with is used once; later lists of hotels are framed.
  const startCamera = useRef(initialCamera)
  const cameraChange = useRef(onCameraChange)
  useEffect(() => {
    cameraChange.current = onCameraChange
  })
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
      const camera = startCamera.current
      instance = new MapLibreMap({
        container,
        style: MAP_STYLE,
        center: camera?.center ?? [0, 30],
        zoom: camera?.zoom ?? 1,
        attributionControl: { compact: true, customAttribution: MAP_ATTRIBUTION },
      })
    } catch {
      // No WebGL.
      setFailed(true)
      return
    }
    let loaded = false
    instance.on('styledata', () => silenceSourceAttribution(instance))
    let foldTimer: ReturnType<typeof setTimeout> | undefined
    const fold = () => {
      clearTimeout(foldTimer)
      foldAttribution(instance)
    }
    instance.on('load', () => {
      loaded = true
      setMap(instance)
      setZoom(instance.getZoom())
      foldTimer = setTimeout(fold, ATTRIBUTION_SHOWN_MS)
      for (const type of ['mousedown', 'touchstart', 'wheel'] as const) instance.once(type, fold)
    })
    // Before the style is in, any error leaves an empty map; later tile errors only leave gaps.
    instance.on('error', () => {
      if (!loaded) setFailed(true)
    })
    instance.on('zoomend', () => setZoom(instance.getZoom()))
    instance.on('moveend', () => {
      const { lng, lat } = instance.getCenter()
      cameraChange.current?.({ center: [lng, lat], zoom: instance.getZoom() })
    })
    return () => {
      clearTimeout(foldTimer)
      instance.remove()
    }
  }, [])

  // The camera frames the hotels of every new list, except the first one when a camera is kept.
  useEffect(() => {
    if (!map || hotels.length === 0) return
    if (startCamera.current) {
      startCamera.current = null
      return
    }
    const bounds = new LngLatBounds()
    for (const { hotel } of hotels) bounds.extend([hotel.lon, hotel.lat])
    map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 0 })
    setZoom(map.getZoom())
  }, [map, hotels])

  // Markers follow the groups. A marker of the same hotel or group keeps its element, so it does not blink.
  useEffect(() => {
    if (!map) return
    const markers = clusters.map(({ key, lon, lat }) =>
      new Marker({ element: elements.get(key), anchor: 'bottom' }).setLngLat([lon, lat]).addTo(map),
    )
    return () => markers.forEach((marker) => marker.remove())
  }, [map, clusters, elements])

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

  if (failed) return fallback

  const show = (id: string) => {
    setPreviewId(id)
    onActivate?.(id)
  }
  const hide = () => {
    setPreviewId(null)
    onActivate?.(null)
  }

  return (
    <div ref={containerRef} className={cn('size-full', ATTRIBUTION_CLASS)} aria-label="Карта отелей" role="region">
      {map &&
        clusters.map((cluster) => {
          if (cluster.members.length > 1)
            return createPortal(
              <button
                type="button"
                aria-label={`${countRu(cluster.members.length, ['вариант', 'варианта', 'вариантов'])}, от ${formatPrice(cluster.price)}, приблизить`}
                data-active={cluster.members.some(({ hotel }) => hotel.id === activeId) || undefined}
                onClick={() =>
                  map.easeTo({
                    center: [cluster.lon, cluster.lat],
                    zoom: expansionZoom(cluster.members, map.getZoom()),
                  })
                }
                className={cn(
                  'group flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-sm/[normal] font-[650] whitespace-nowrap shadow-(--shadow-card) transition-[background-color,color,scale] duration-150',
                  'bg-card text-foreground hover:bg-secondary data-active:scale-110 data-active:bg-primary data-active:text-primary-foreground',
                )}
              >
                <span className="flex size-5.5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground group-data-active:bg-primary-foreground group-data-active:text-primary">
                  {cluster.members.length}
                </span>{' '}
                от {formatPrice(cluster.price)}
              </button>,
              elementFor(cluster.key),
              cluster.key,
            )
          const { hotel, price } = cluster.members[0]
          const active = hotel.id === activeId
          const current = hotel.id === currentId
          return createPortal(
            <button
              type="button"
              aria-label={`${hotel.name}, ${formatPrice(price)}`}
              aria-haspopup="dialog"
              aria-describedby={previewId === hotel.id ? previewDomId : undefined}
              data-active={active || undefined}
              data-current={current || undefined}
              aria-current={current || undefined}
              onClick={() => onOpen(hotel.id)}
              // Only a mouse hovers: a tap opens the hotel at once, without the preview.
              onPointerEnter={(e: PointerEvent) => e.pointerType === 'mouse' && show(hotel.id)}
              onPointerLeave={(e: PointerEvent) => e.pointerType === 'mouse' && hide()}
              onFocus={(e: FocusEvent<HTMLElement>) => e.currentTarget.matches(':focus-visible') && show(hotel.id)}
              onBlur={hide}
              onKeyDown={(e) => e.key === 'Escape' && setPreviewId(null)}
              className={cn(
                'rounded-full px-2.5 py-1 text-sm/[normal] font-[650] whitespace-nowrap shadow-(--shadow-card) transition-[background-color,color,scale] duration-150',
                current && 'ring-2 ring-primary',
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
        {hasStars(hotel) && (
          <span
            role="img"
            aria-label={countRu(hotel.stars, ['звезда', 'звезды', 'звёзд'])}
            className="flex gap-0.5 text-(--decor-star)"
          >
            {Array.from({ length: hotel.stars }, (_, i) => (
              <Star key={i} className="size-3.5" fill="currentColor" strokeWidth={0} aria-hidden />
            ))}
          </span>
        )}
        <div className="flex items-center gap-2 pt-1">
          <p className="mr-auto text-base font-bold whitespace-nowrap">{formatPrice(price)}</p>
          {isRated(hotel) && (
            <Badge className="bg-primary text-primary-foreground">
              <span className="sr-only">Оценка гостей </span>
              {formatDecimal(hotel.rating)}
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}
