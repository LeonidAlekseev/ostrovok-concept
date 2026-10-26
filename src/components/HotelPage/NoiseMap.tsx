'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker, type ExpressionSpecification, type GeoJSONSource } from 'maplibre-gl'
import { cn } from 'cn'
import type { NoiseMap as NoiseMapData } from '@/lib/db/noise'
import { EEA_NOISE_URL, LEGEND_STEPS, NOISE_COLORS, type NoiseIndicator, type NoisyPlace } from '@/lib/noise'
import {
  ATTRIBUTION_SHOWN_MS,
  foldAttribution,
  MAP_ATTRIBUTION,
  MAP_STYLE,
  silenceSourceAttribution,
} from '../SearchResultsPage/mapSetup'

/** EEA's credit for the contours, next to OpenStreetMap's. */
export const EEA_ATTRIBUTION = `<a href="${EEA_NOISE_URL}" target="_blank" rel="noopener">© EEA, END 2022</a>`

/** The streets around the hotel, tilted so the buildings stand. */
const ZOOM = 16.3
const PITCH = 45

/** The colour of a contour by its band's lower bound. */
const FILL_COLOR: ExpressionSpecification = [
  'step',
  ['coalesce', ['get', 'db_min'], 0],
  NOISE_COLORS[0],
  ...LEGEND_STEPS.flatMap((step, i) => [step, NOISE_COLORS[i + 1]] as const),
]

/** The places of the nightlife, of the food and of the rails. */
const PLACE_COLOR: ExpressionSpecification = [
  'match',
  ['get', 'category'],
  ['nightclub', 'bar'],
  '#7c3aed',
  ['restaurant', 'fast_food'],
  '#ea580c',
  '#2563eb',
]

const empty: NoiseMapData = { type: 'FeatureCollection', features: [] }

// The attribution as on the results map: a small white pill. MapLibre's unlayered styles beat Tailwind's layers.
const ATTRIBUTION_CLASS =
  '[&_.maplibregl-ctrl-attrib]:m-2! [&_.maplibregl-ctrl-attrib]:rounded-full! [&_.maplibregl-ctrl-attrib]:bg-white! [&_.maplibregl-ctrl-attrib]:text-xs! [&_.maplibregl-ctrl-attrib_a]:text-black!'

/**
 * The EEA contours of `indicator` around the hotel on the city's map, the louder above, under the buildings and the
 * labels; the hotel's pin and the loud places of OSM as dots. `onFail` when the map cannot load (no WebGL, no tiles).
 */
export default function NoiseMap({
  center,
  contours,
  indicator,
  places,
  onFail,
}: {
  center: { lat: number; lon: number }
  contours: NoiseMapData | null
  indicator: NoiseIndicator
  places: NoisyPlace[]
  onFail: () => void
}) {
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
          attributionControl: { compact: true, customAttribution: [MAP_ATTRIBUTION, EEA_ATTRIBUTION] },
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
        // Under the buildings and the labels: the first extruded or symbol layer of the style.
        const before = instance
          .getStyle()
          .layers.find((layer) => layer.type === 'fill-extrusion' || layer.type === 'symbol')?.id
        instance.addSource('noise', { type: 'geojson', data: empty })
        instance.addLayer(
          {
            id: 'noise',
            type: 'fill',
            source: 'noise',
            paint: { 'fill-color': FILL_COLOR, 'fill-opacity': 0.5, 'fill-antialias': false },
          },
          before,
        )
        instance.addSource('noisy-places', { type: 'geojson', data: empty })
        instance.addLayer({
          id: 'noisy-places',
          type: 'circle',
          source: 'noisy-places',
          paint: {
            'circle-radius': 6,
            'circle-color': PLACE_COLOR,
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2,
          },
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

  // The contours of the indicator, quiet first so the louder lie above. The bands below 40 dB are left out: each layer
  // has one around everything it maps, and their stack would tint the louder bands of the other layers.
  useEffect(() => {
    if (!map) return
    const features = (contours ?? empty).features
      .filter((f) => f.properties.indicator === indicator && f.properties.db_min !== null)
      .sort((a, b) => (a.properties.db_min ?? 0) - (b.properties.db_min ?? 0))
    map
      .getSource<GeoJSONSource>('noise')
      ?.setData({ type: 'FeatureCollection', features } as Parameters<GeoJSONSource['setData']>[0])
  }, [map, contours, indicator])

  useEffect(() => {
    if (!map) return
    map.getSource<GeoJSONSource>('noisy-places')?.setData({
      type: 'FeatureCollection',
      features: places.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: { category: p.category },
      })),
    })
  }, [map, places])

  return <div ref={containerRef} className={cn('size-full', ATTRIBUTION_CLASS)} />
}
