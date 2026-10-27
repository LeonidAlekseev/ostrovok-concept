'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Map as MapLibreMap,
  Marker,
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSource,
} from 'maplibre-gl'
import { cn } from 'cn'
import type { ViewMap as ViewMapData } from '@/lib/db/view'
import { pointAt, SIDE_HALF_WIDTH_DEG, VIEW_MAP_RADIUS_M, type Tone } from '@/lib/view'
import { ATTRIBUTION_CLASS, MAP_ATTRIBUTION, MAP_STYLE, manageAttribution } from '../SearchResultsPage/mapSetup'
import {
  BLOCKER_COLOR,
  BUILDING_COLOR,
  ESTIMATED_BUILDING_COLOR,
  HOTEL_BUILDING_COLOR,
  SECTOR_COLOR,
  SUNRISE_COLOR,
  SUNSET_COLOR,
  TONE_COLOR,
} from './viewColors'

/** EUBUCCO's credit for the buildings' heights, next to OpenStreetMap's. */
const EUBUCCO_ATTRIBUTION =
  '<a href="https://eubucco.com/data/download/v0.2" target="_blank" rel="noopener">© EUBUCCO v0.2</a>'

/** The blocks around the hotel, tilted so the buildings stand. */
const ZOOM = 16
const PITCH = 55

/** The fan of the chosen side and the sun's line, m. */
const SECTOR_M = 450
const SUN_M = 700

/** The hotel's building is blue, a building in the way of a line orange; the rest grey, the estimated lighter. */
const buildingColor = (blockers: readonly string[], hotel: string | null): ExpressionSpecification => [
  'case',
  ['==', ['get', 'id'], hotel ?? ''],
  HOTEL_BUILDING_COLOR,
  ['in', ['get', 'id'], ['literal', blockers]],
  BLOCKER_COLOR,
  ['get', 'estimated'],
  ESTIMATED_BUILDING_COLOR,
  BUILDING_COLOR,
]

export interface MapTarget {
  lat: number
  lon: number
  tone: Tone
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
 * The buildings of EUBUCCO around the hotel standing by their heights (OpenFreeMap's own 3D buildings beyond them), the
 * hotel's and the ones in the way from the chosen floor coloured, the fan of the chosen side with the map turned to it,
 * the lines to the places coloured by the tone of their verdict from the floor and the sun's lines at the sunset and the sunrise.
 * `onFail` when the map cannot load (no WebGL, no tiles).
 */
export default function ViewMap({
  center: point,
  buildings,
  bearing,
  sunsetAzimuth,
  sunriseAzimuth,
  targets,
  blockers,
  hotelBuilding,
  onFail,
}: {
  center: { lat: number; lon: number }
  buildings: ViewMapData | null
  bearing: number
  sunsetAzimuth: number | null
  sunriseAzimuth: number | null
  targets: readonly MapTarget[]
  blockers: readonly string[]
  hotelBuilding: string | null
  onFail: () => void
}) {
  const center = useMemo(() => ({ lat: point.lat, lon: point.lon }), [point.lat, point.lon])
  const [map, setMap] = useState<MapLibreMap | null>(null)
  /** The style's own 3D buildings (OSM's heights) and their filters. */
  const styleBuildings = useRef<{ id: string; filter: FilterSpecification | undefined }[]>([])
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
      const stopAttribution = manageAttribution(instance)
      instance.on('load', () => {
        loaded = true
        const layers = instance.getStyle().layers
        styleBuildings.current = layers.flatMap((layer) =>
          layer.type === 'fill-extrusion' ? [{ id: layer.id, filter: layer.filter }] : [],
        )
        const labels = layers.find((layer) => layer.type === 'symbol')?.id
        instance.addSource('view-sector', { type: 'geojson', data: empty })
        instance.addLayer(
          {
            id: 'view-sector',
            type: 'fill',
            source: 'view-sector',
            paint: { 'fill-color': SECTOR_COLOR, 'fill-opacity': 0.3 },
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
            'fill-extrusion-color': buildingColor([], null),
            'fill-extrusion-opacity': 0.85,
          },
        })
        instance.addSource('view-sun', { type: 'geojson', data: empty })
        instance.addLayer({
          id: 'view-sun',
          type: 'line',
          source: 'view-sun',
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': 4 },
        })
        new Marker({ color: '#0f172a' }).setLngLat([center.lon, center.lat]).addTo(instance)
        setMap(instance)
      })
      instance.on('error', () => {
        if (!loaded) fail.current()
      })
      return () => {
        stopAttribution()
        instance.remove()
      }
    },
    // The map is made once for its hotel.
    [center.lat, center.lon],
  )

  // EUBUCCO's buildings stand within their radius, the style's own 3D buildings beyond it (everywhere without EUBUCCO's):
  // the whole view stands, the heights the lines are checked by in the middle.
  useEffect(() => {
    if (!map) return
    map.getSource<GeoJSONSource>('view-buildings')?.setData((buildings ?? empty) as Data)
    const beyond: FilterSpecification = [
      '>',
      ['distance', { type: 'Point', coordinates: [center.lon, center.lat] }],
      VIEW_MAP_RADIUS_M,
    ]
    for (const { id, filter } of styleBuildings.current)
      map.setFilter(
        id,
        buildings?.features.length ? (filter ? ['all', filter as ExpressionSpecification, beyond] : beyond) : filter,
      )
  }, [map, buildings, center])

  useEffect(() => {
    if (!map) return
    map.setPaintProperty('view-buildings', 'fill-extrusion-color', buildingColor(blockers, hotelBuilding))
  }, [map, blockers, hotelBuilding])

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
        properties: { color: TONE_COLOR[t.tone] },
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
    const suns = [
      { azimuth: sunsetAzimuth, color: SUNSET_COLOR },
      { azimuth: sunriseAzimuth, color: SUNRISE_COLOR },
    ]
    map.getSource<GeoJSONSource>('view-sun')?.setData({
      type: 'FeatureCollection',
      features: suns.flatMap(({ azimuth, color }) => {
        if (azimuth === null) return []
        const end = pointAt(center, azimuth, SUN_M)
        return [
          {
            type: 'Feature' as const,
            properties: { color },
            geometry: {
              type: 'LineString' as const,
              coordinates: [
                [center.lon, center.lat],
                [end.lon, end.lat],
              ],
            },
          },
        ]
      }),
    })
  }, [map, center, sunsetAzimuth, sunriseAzimuth])

  return <div ref={containerRef} className={cn('size-full', ATTRIBUTION_CLASS)} />
}
