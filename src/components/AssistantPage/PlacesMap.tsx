'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import { BedDouble } from 'lucide-react'
import { cn } from 'cn'
import { placeNumbers, type ChatMap } from '@/lib/geo/chatMap'
import {
  ATTRIBUTION_CLASS,
  ATTRIBUTION_SHOWN_MS,
  foldAttribution,
  MAP_ATTRIBUTION,
  MAP_STYLE,
  silenceSourceAttribution,
} from '../SearchResultsPage/mapSetup'

/** The routes' colour when the page has no `--brand-blue`: the brand's blue. */
const ROUTE_COLOR = '#0645e8'
const STRAIGHT_COLOR = '#6b7280'

/** A feed scrolls under the map: the wheel zooms with Ctrl or ⌘, a finger moves the feed, two the map. */
const GESTURES_LOCALE = {
  'CooperativeGesturesHandler.WindowsHelpText': 'Чтобы приблизить карту, крутите колесо с Ctrl',
  'CooperativeGesturesHandler.MacHelpText': 'Чтобы приблизить карту, крутите колесо с ⌘',
  'CooperativeGesturesHandler.MobileHelpText': 'Двигайте карту двумя пальцами',
  'NavigationControl.ZoomIn': 'Приблизить',
  'NavigationControl.ZoomOut': 'Отдалить',
}

function addRoutes(map: MapLibreMap, data: ChatMap, color: string) {
  map.addSource('routes', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: data.routes.map((route) => ({
        type: 'Feature',
        properties: { mode: route.mode },
        geometry: { type: 'LineString', coordinates: route.coordinates },
      })),
    },
  })
  const road = ['!=', ['get', 'mode'], 'straight'] as const
  map.addLayer({
    id: 'routes-casing',
    type: 'line',
    source: 'routes',
    filter: road as never,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 7 },
  })
  map.addLayer({
    id: 'routes',
    type: 'line',
    source: 'routes',
    filter: road as never,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': color, 'line-width': 4 },
  })
  // No route: the straight line, dashed, as «по прямой» says.
  map.addLayer({
    id: 'routes-straight',
    type: 'line',
    source: 'routes',
    filter: ['==', ['get', 'mode'], 'straight'],
    paint: { 'line-color': STRAIGHT_COLOR, 'line-width': 3, 'line-dasharray': [2, 2] },
  })
}

/**
 * The map of Эвал's answer on MapLibre with the style and the credit of the results map: the hotel, the numbered
 * places of the list under it and the routes. A failure before the style loads calls `onFail`: the list stays.
 */
export default function PlacesMap({ map: data, onFail }: { map: ChatMap; onFail: () => void }) {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  // One element per point, created once: MapLibre moves it, React renders the marker into it.
  const [elements] = useState(() => data.points.map(() => document.createElement('div')))

  const containerRef = useCallback(
    (container: HTMLDivElement | null) => {
      if (!container) return
      const bounds = new LngLatBounds()
      for (const point of data.points) bounds.extend([point.lon, point.lat])
      for (const route of data.routes) for (const pair of route.coordinates) bounds.extend(pair)
      let instance: MapLibreMap
      try {
        instance = new MapLibreMap({
          container,
          style: MAP_STYLE,
          bounds,
          fitBoundsOptions: { padding: { top: 40, bottom: 40, left: 40, right: 64 }, maxZoom: 16 },
          cooperativeGestures: true,
          locale: GESTURES_LOCALE,
          attributionControl: { compact: true, customAttribution: MAP_ATTRIBUTION },
        })
      } catch {
        // No WebGL.
        onFail()
        return
      }
      instance.addControl(new NavigationControl({ showCompass: false }), 'top-right')
      let loaded = false
      let foldTimer: ReturnType<typeof setTimeout> | undefined
      const fold = () => {
        clearTimeout(foldTimer)
        foldAttribution(instance)
      }
      instance.on('styledata', () => silenceSourceAttribution(instance))
      instance.on('load', () => {
        loaded = true
        const color = getComputedStyle(container).getPropertyValue('--brand-blue').trim() || ROUTE_COLOR
        if (data.routes.length) addRoutes(instance, data, color)
        data.points.forEach((point, i) =>
          new Marker({ element: elements[i], anchor: point.kind === 'hotel' ? 'bottom' : 'center' })
            .setLngLat([point.lon, point.lat])
            .addTo(instance),
        )
        setMap(instance)
        foldTimer = setTimeout(fold, ATTRIBUTION_SHOWN_MS)
        for (const type of ['mousedown', 'touchstart', 'wheel'] as const) instance.once(type, fold)
      })
      instance.on('error', () => {
        if (!loaded) onFail()
      })
      return () => {
        clearTimeout(foldTimer)
        instance.remove()
      }
    },
    // The map of a message never changes.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const numbers = placeNumbers(data)
  return (
    <div
      ref={containerRef}
      className={cn('size-full', ATTRIBUTION_CLASS)}
      role="region"
      aria-label="Карта мест рядом с отелем"
    >
      {map &&
        data.points.map((point, i) => {
          if (point.kind === 'hotel')
            return createPortal(
              <span
                className="flex items-center gap-1 rounded-full bg-primary py-1 pr-2.5 pl-2 text-xs/[normal] font-semibold whitespace-nowrap text-primary-foreground shadow-(--shadow-card)"
                title={point.label}
              >
                <BedDouble className="size-3.5" aria-hidden />
                Отель
              </span>,
              elements[i],
              `point-${i}`,
            )
          return createPortal(
            <span
              className="flex size-6 items-center justify-center rounded-full border-2 border-white bg-foreground text-xs font-bold text-background shadow-(--shadow-card)"
              title={point.label}
            >
              {numbers[i]}
            </span>,
            elements[i],
            `point-${i}`,
          )
        })}
    </div>
  )
}
