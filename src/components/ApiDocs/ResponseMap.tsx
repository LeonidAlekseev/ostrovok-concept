'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, Popup, type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl'
import { cn } from 'cn'
import {
  ATTRIBUTION_CLASS,
  EEA_ATTRIBUTION,
  EUBUCCO_ATTRIBUTION,
  MAP_ATTRIBUTION,
  MAP_STYLE,
  manageAttribution,
} from '../SearchResultsPage/mapSetup'
import { boundsOf, type GeoAnswer } from './geo'

/** The credits of the data an answer draws, next to OpenStreetMap's. */
const CREDITS = { eea: EEA_ATTRIBUTION, eubucco: EUBUCCO_ATTRIBUTION }

const LAYERS = ['fills', 'lines', 'points'] as const

/** Shows `answer` and fits the view to it; the map is made again only for other credits. */
export default function ResponseMap({ answer, onFail }: { answer: GeoAnswer; onFail: () => void }) {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const credits = answer.sources.join(',')
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
          center: [-0.3763, 39.4699],
          zoom: 12,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          attributionControl: {
            compact: true,
            customAttribution: [
              MAP_ATTRIBUTION,
              ...(credits ? credits.split(',') : []).map((source) => CREDITS[source as keyof typeof CREDITS]),
            ],
          },
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
        // The style's 3D buildings stand out of a flat map.
        for (const layer of layers)
          if (layer.type === 'fill-extrusion') instance.setLayoutProperty(layer.id, 'visibility', 'none')
        instance.addSource('answer', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        const under = layers.find((layer) => layer.type === 'symbol')?.id
        instance.addLayer(
          {
            id: 'fills',
            type: 'fill',
            source: 'answer',
            filter: ['==', ['geometry-type'], 'Polygon'],
            // The buildings stand out of the style's grey ones by their dark outline.
            paint: {
              'fill-color': ['get', 'color'],
              'fill-opacity': ['case', ['==', ['get', 'kind'], 'building'], 0.85, 0.55],
              'fill-outline-color': ['case', ['==', ['get', 'kind'], 'building'], '#3f3f46', '#ffffff'],
            },
          },
          under,
        )
        instance.addLayer({
          id: 'lines',
          type: 'line',
          source: 'answer',
          filter: ['==', ['geometry-type'], 'LineString'],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['case', ['==', ['get', 'kind'], 'route'], 4, 1.5],
            'line-opacity': 0.85,
          },
        })
        instance.addLayer({
          id: 'points',
          type: 'circle',
          source: 'answer',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': ['case', ['==', ['get', 'kind'], 'hotel'], 8, 6],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          },
        })
        // A tap on a shape names it: the hotel, the place, the building's height, the noise band.
        const popup = new Popup({ closeButton: false, maxWidth: '240px' })
        const show = (event: MapLayerMouseEvent) => {
          const label = event.features?.[0]?.properties?.label
          if (typeof label === 'string') popup.setLngLat(event.lngLat).setText(label).addTo(instance)
        }
        for (const layer of LAYERS) {
          instance.on('click', layer, show)
          instance.on('mouseenter', layer, () => (instance.getCanvas().style.cursor = 'pointer'))
          instance.on('mouseleave', layer, () => (instance.getCanvas().style.cursor = ''))
        }
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
    // The credits are set when the map is made.
    [credits],
  )

  useEffect(() => {
    if (!map) return
    ;(map.getSource('answer') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: answer.features,
    })
    const box = boundsOf(answer.features)
    if (box) map.fitBounds(box, { padding: 32, maxZoom: 17, duration: 0 })
  }, [map, answer])

  return (
    <div
      ref={containerRef}
      className={cn('size-full', ATTRIBUTION_CLASS)}
      role="region"
      aria-label={`Карта: ${answer.title}`}
    />
  )
}
