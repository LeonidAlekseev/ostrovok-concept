'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { LngLatBounds, Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl'
import { cn } from 'cn'
import { formatPrice } from '../../lib/format'
import { MapUnavailable } from './MapUnavailable'

// MapLibre looks for its worker next to its own module, which the bundler moves: point it to the file.
setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href)

/** Free vector tiles without a key; the style credits OpenFreeMap, OpenMapTiles and OpenStreetMap. */
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

export interface MapHotel {
  id: string
  name: string
  lat: number
  lon: number
  /** Price per night, ₽. */
  price: number
}

interface Props {
  hotels: MapHotel[]
  activeId: string | null
  onSelect: (id: string) => void
}

/**
 * MapLibre map of the results with a price marker per hotel. Markers are React portals into the
 * elements MapLibre positions. A failure before the style loads (offline, no WebGL) shows
 * "Карта недоступна"; the list next to the map does not depend on it.
 */
export default function SearchMap({ hotels, activeId, onSelect }: Props) {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [failed, setFailed] = useState(false)
  // One element per hotel, created once: MapLibre moves it, React renders the marker into it.
  const [elements] = useState(() => new Map<string, HTMLElement>())
  const elementFor = (id: string) => {
    let element = elements.get(id)
    if (!element) {
      element = document.createElement('div')
      // The active marker is lifted above its neighbours.
      element.className = 'has-[[aria-pressed=true]]:z-1'
      elements.set(id, element)
    }
    return element
  }

  // A ref callback rather than an effect: the map lives exactly as long as its container.
  const containerRef = useCallback((container: HTMLDivElement | null) => {
    if (!container) return
    let instance: MapLibreMap
    try {
      instance = new MapLibreMap({ container, style: MAP_STYLE, center: [0, 30], zoom: 1 })
    } catch {
      // No WebGL.
      setFailed(true)
      return
    }
    let loaded = false
    instance.on('load', () => {
      loaded = true
      setMap(instance)
    })
    // Before the style is in, any error leaves an empty map; later tile errors only leave gaps.
    instance.on('error', () => {
      if (!loaded) setFailed(true)
    })
    // The container is resized by the layout (the list/map switch, the window): keep the canvas in step.
    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(container)
    return () => {
      observer.disconnect()
      instance.remove()
    }
  }, [])

  // Markers follow the hotel list; the camera frames them.
  useEffect(() => {
    if (!map || hotels.length === 0) return
    const markers = hotels.map((hotel) =>
      new Marker({ element: elements.get(hotel.id), anchor: 'bottom' }).setLngLat([hotel.lon, hotel.lat]).addTo(map),
    )
    const bounds = new LngLatBounds()
    for (const hotel of hotels) bounds.extend([hotel.lon, hotel.lat])
    map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 0 })
    return () => markers.forEach((marker) => marker.remove())
  }, [map, hotels, elements])

  if (failed) return <MapUnavailable />

  return (
    <div ref={containerRef} className="size-full" aria-label="Карта отелей" role="region">
      {map &&
        hotels.map((hotel) => {
          const active = hotel.id === activeId
          return createPortal(
            <button
              type="button"
              aria-label={`${hotel.name}, ${formatPrice(hotel.price)} за ночь`}
              aria-pressed={active}
              onClick={() => onSelect(hotel.id)}
              className={cn(
                'rounded-full px-2.5 py-1 text-sm/[normal] font-[650] whitespace-nowrap shadow-(--shadow-card) transition-[background-color,color,scale] duration-150',
                active ? 'scale-110 bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-secondary',
              )}
            >
              {formatPrice(hotel.price)}
            </button>,
            elementFor(hotel.id),
            hotel.id,
          )
        })}
    </div>
  )
}
