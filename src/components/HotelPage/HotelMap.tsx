'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { BedDouble } from 'lucide-react'
import type { Hotel } from '../../lib/catalog'
import { ATTRIBUTION_SHOWN_MS, foldAttribution, MAP_STYLE } from '../SearchResultsPage/mapSetup'
import { HotelMapUnavailable } from './HotelMapUnavailable'

/** Streets around the hotel. */
const ZOOM = 15

/**
 * MapLibre map centred on the hotel with its marker, in the style and with the attribution of the
 * results map. A failure before the style loads (offline, no WebGL) shows "Карта недоступна".
 */
export default function HotelMap({ hotel }: { hotel: Hotel }) {
  const [failed, setFailed] = useState(false)
  // MapLibre positions the element; React renders the marker into it.
  const [markerElement] = useState(() => document.createElement('div'))
  const { lon, lat } = hotel

  // A ref callback rather than an effect: the map lives exactly as long as its container.
  const containerRef = useCallback(
    (container: HTMLDivElement | null) => {
      if (!container) return
      let instance: MapLibreMap
      try {
        instance = new MapLibreMap({
          container,
          style: MAP_STYLE,
          center: [lon, lat],
          zoom: ZOOM,
          attributionControl: { compact: true },
        })
      } catch {
        // No WebGL.
        setFailed(true)
        return
      }
      const marker = new Marker({ element: markerElement, anchor: 'bottom' }).setLngLat([lon, lat]).addTo(instance)
      let loaded = false
      let foldTimer: ReturnType<typeof setTimeout> | undefined
      const fold = () => {
        clearTimeout(foldTimer)
        foldAttribution(instance)
      }
      instance.on('load', () => {
        loaded = true
        foldTimer = setTimeout(fold, ATTRIBUTION_SHOWN_MS)
        for (const type of ['mousedown', 'touchstart', 'wheel'] as const) instance.once(type, fold)
      })
      instance.on('error', () => {
        if (!loaded) setFailed(true)
      })
      return () => {
        clearTimeout(foldTimer)
        marker.remove()
        instance.remove()
      }
    },
    [lon, lat, markerElement],
  )

  if (failed) return <HotelMapUnavailable />

  return (
    <div ref={containerRef} className="size-full" role="region" aria-label="Карта">
      {createPortal(
        <span
          role="img"
          aria-label={hotel.name}
          className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-(--shadow-card) ring-4 ring-card"
        >
          <BedDouble className="size-5" aria-hidden />
        </span>,
        markerElement,
      )}
    </div>
  )
}
