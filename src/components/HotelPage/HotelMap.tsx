'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { BedDouble } from 'lucide-react'
import { fullHotelsIn, type Hotel } from '../../lib/catalog'
import { ATTRIBUTION_SHOWN_MS, foldAttribution, MAP_STYLE } from '../SearchResultsPage/mapSetup'
import { HotelMapUnavailable } from './HotelMapUnavailable'

/** The streets around the hotel and the neighbouring hotels of the city. */
const ZOOM = 12

/**
 * MapLibre map centred on the hotel, in the style and with the attribution of the results map: the
 * other hotels of its city as muted markers, this one as a large `primary` marker above them. A
 * failure before the style loads (offline, no WebGL) shows "Карта недоступна".
 */
export default function HotelMap({ hotel }: { hotel: Hotel }) {
  const [failed, setFailed] = useState(false)
  // The hotel last: its marker is added last and so stands above the rest.
  const shown = useMemo(() => [...fullHotelsIn(hotel.destinationId).filter((h) => h.id !== hotel.id), hotel], [hotel])
  // MapLibre positions the elements; React renders the markers into them.
  const elements = useMemo(() => shown.map(() => document.createElement('div')), [shown])
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
      const markers = shown.map((h, i) =>
        new Marker({ element: elements[i], anchor: h.id === hotel.id ? 'bottom' : 'center' })
          .setLngLat([h.lon, h.lat])
          .addTo(instance),
      )
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
        for (const marker of markers) marker.remove()
        instance.remove()
      }
    },
    [lon, lat, shown, elements, hotel.id],
  )

  if (failed) return <HotelMapUnavailable />

  return (
    <div ref={containerRef} className="size-full" role="region" aria-label="Карта">
      {shown.map((h, i) =>
        createPortal(
          h.id === hotel.id ? (
            <span
              role="img"
              aria-label={h.name}
              aria-current="true"
              className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-(--shadow-card) ring-4 ring-card"
            >
              <BedDouble className="size-5" aria-hidden />
            </span>
          ) : (
            <span
              role="img"
              aria-label={h.name}
              className="flex size-7 items-center justify-center rounded-full bg-card text-muted-foreground shadow-(--shadow-card) ring-1 ring-border"
            >
              <BedDouble className="size-3.5" aria-hidden />
            </span>
          ),
          elements[i],
          h.id,
        ),
      )}
    </div>
  )
}
