'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker, type ExpressionSpecification, type GeoJSONSource } from 'maplibre-gl'
import { cn } from 'cn'
import type { ViewMap as ViewMapData } from '@/lib/db/view'
import { pointAt, SIDE_HALF_WIDTH_DEG, type Verdict } from '@/lib/view'
import {
  ATTRIBUTION_CLASS,
  ATTRIBUTION_SHOWN_MS,
  foldAttribution,
  MAP_ATTRIBUTION,
  MAP_STYLE,
  silenceSourceAttribution,
} from '../SearchResultsPage/mapSetup'

/** EUBUCCO's credit for the buildings' heights, next to OpenStreetMap's. */
const EUBUCCO_ATTRIBUTION =
  '<a href="https://eubucco.com/data/download/v0.2" target="_blank" rel="noopener">© EUBUCCO v0.2</a>'

/** The blocks around the hotel, tilted so the buildings stand. */
const ZOOM = 16
const PITCH = 55

/** The fan of the chosen side and the sun's line, m. */
const SECTOR_M = 450
const SUN_M = 700

const VERDICT_COLOR: Record<Verdict, string> = {
  visible: '#16a34a',
  obstructed: '#d97706',
  unknown: '#94a3b8',
}

/** A building in the way of a line is orange; the rest grey, the estimated heights a little lighter. */
const BUILDING_COLOR = (blockers: readonly string[]): ExpressionSpecification => [
  'case',
  ['in', ['get', 'id'], ['literal', blockers]],
  '#f97316',
  ['get', 'estimated'],
  '#d4d4d8',
  '#a1a1aa',
]

export interface MapTarget {
  lat: number
  lon: number
  verdict: Verdict
}

const empty = { type: 'FeatureCollection' as const, features: [] }

type Data = Parameters<GeoJSONSource['setData']>[0]

/** The fan of the side: the hotel and an arc of `SIDE_HALF_WIDTH_DEG` either way of `bearing`. */
function sector(center: { lat: number; lon: number }, bearing: number): Data {
  const arc = Array.from({ length: 13 }, (_, i) => {
    const p = pointAt(center, bearing - SIDE_HALF_WIDTH_DEG + (i * 2 * SIDE_HALF_WIDTH_DEG) / 12, SECTOR_M)
    return [p.lon, p.lat]
  })
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [[[center.lon, center.lat], ...arc, [center.lon, center.lat]]] },
  }
}

/**
 * The buildings of EUBUCCO around the hotel standing by their heights (OpenFreeMap's own 3D buildings are hidden), the
 * fan of the chosen side with the map turned to it, the lines to the places coloured by their verdict and the sun's
 * line at the sunset. `onFail` when the map cannot load (no WebGL, no tiles).
 */
export default function ViewMap({
  center: point,
  buildings,
  bearing,
  sunAzimuth,
  targets,
  blockers,
  onFail,
}: {
  center: { lat: number; lon: number }
  buildings: ViewMapData | null
  bearing: number
  sunAzimuth: number | null
  targets: readonly MapTarget[]
  blockers: readonly string[]
  onFail: () => void
}) {
  const center = useMemo(() => ({ lat: point.lat, lon: point.lon }), [point.lat, point.lon])
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const fail = useRef(onFail)
  useEffect(() => {
    fail.current = onFail
  })

  const containerRef = useCallback(
    (container: HTMLDivElement | null) => {
      if (!container) return
      let instance: MapLibreMap
      try {
        instance = new MapLibreMap({
          container,
          style: MAP_STYLE,
          center: [center.lon, center.lat],
          zoom: ZOOM,
          pitch: PITCH,
          // The page scrolls past the map: the wheel does not zoom it.
          scrollZoom: false,
          attributionControl: { compact: true, customAttribution: [MAP_ATTRIBUTION, EUBUCCO_ATTRIBUTION] },
        })
      } catch {
        // No WebGL.
        fail.current()
        return
      }
      let loaded = false
      instance.on('styledata', () => silenceSourceAttribution(instance))
      let foldTimer: ReturnType<typeof setTimeout> | undefined
      instance.on('load', () => {
        loaded = true
        const layers = instance.getStyle().layers
        // The style's 3D buildings are OSM's heights: EUBUCCO's stand instead.
        for (const layer of layers)
          if (layer.type === 'fill-extrusion') instance.setLayoutProperty(layer.id, 'visibility', 'none')
        const labels = layers.find((layer) => layer.type === 'symbol')?.id
        instance.addSource('view-sector', { type: 'geojson', data: empty })
        instance.addLayer(
          {
            id: 'view-sector',
            type: 'fill',
            source: 'view-sector',
            paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.3 },
          },
          labels,
        )
        instance.addSource('view-lines', { type: 'geojson', data: empty })
        instance.addLayer(
          {
            id: 'view-lines',
            type: 'line',
            source: 'view-lines',
            layout: { 'line-cap': 'round' },
            paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
          },
          labels,
        )
        instance.addSource('view-buildings', { type: 'geojson', data: empty })
        instance.addLayer({
          id: 'view-buildings',
          type: 'fill-extrusion',
          source: 'view-buildings',
          paint: {
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-color': BUILDING_COLOR([]),
            'fill-extrusion-opacity': 0.85,
          },
        })
        instance.addSource('view-sun', { type: 'geojson', data: empty })
        instance.addLayer({
          id: 'view-sun',
          type: 'line',
          source: 'view-sun',
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': '#f59e0b', 'line-width': 4 },
        })
        new Marker({ color: '#0f172a' }).setLngLat([center.lon, center.lat]).addTo(instance)
        setMap(instance)
        foldTimer = setTimeout(() => foldAttribution(instance), ATTRIBUTION_SHOWN_MS)
      })
      instance.on('error', () => {
        if (!loaded) fail.current()
      })
      return () => {
        clearTimeout(foldTimer)
        instance.remove()
      }
    },
    // The map is made once for its hotel.
    [center.lat, center.lon],
  )

  useEffect(() => {
    if (!map) return
    map.getSource<GeoJSONSource>('view-buildings')?.setData((buildings ?? empty) as Data)
  }, [map, buildings])

  useEffect(() => {
    if (!map) return
    map.setPaintProperty('view-buildings', 'fill-extrusion-color', BUILDING_COLOR(blockers))
  }, [map, blockers])

  // The chosen side faces up.
  useEffect(() => {
    if (!map) return
    map.getSource<GeoJSONSource>('view-sector')?.setData(sector(center, bearing))
    map.easeTo({ bearing, duration: 600 })
  }, [map, center, bearing])

  useEffect(() => {
    if (!map) return
    map.getSource<GeoJSONSource>('view-lines')?.setData({
      type: 'FeatureCollection',
      features: targets.map((t) => ({
        type: 'Feature',
        properties: { color: VERDICT_COLOR[t.verdict] },
        geometry: {
          type: 'LineString',
          coordinates: [
            [center.lon, center.lat],
            [t.lon, t.lat],
          ],
        },
      })),
    })
  }, [map, center, targets])

  useEffect(() => {
    if (!map) return
    const end = sunAzimuth === null ? null : pointAt(center, sunAzimuth, SUN_M)
    map.getSource<GeoJSONSource>('view-sun')?.setData(
      end
        ? {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [center.lon, center.lat],
                [end.lon, end.lat],
              ],
            },
          }
        : empty,
    )
  }, [map, center, sunAzimuth])

  return <div ref={containerRef} className={cn('size-full', ATTRIBUTION_CLASS)} />
}
