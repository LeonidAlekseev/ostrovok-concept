'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Map as MapLibreMap, Marker, Popup, type ExpressionSpecification, type GeoJSONSource } from 'maplibre-gl'
import { cn } from 'cn'
import type { NoiseMap as NoiseMapData } from '@/lib/db/noise'
import { distanceLabel } from '@/lib/hotelDetails'
import {
  EEA_NOISE_URL,
  LEGEND_STEPS,
  NOISE_COLORS,
  NOISY_LABEL,
  noisyGroup,
  type NoiseIndicator,
  type NoisyPlace,
} from '@/lib/noise'
import { ATTRIBUTION_CLASS, MAP_ATTRIBUTION, MAP_STYLE, manageAttribution } from '../SearchResultsPage/mapSetup'

/** EEA's credit for the contours, next to OpenStreetMap's. */
export const EEA_ATTRIBUTION = `<a href="${EEA_NOISE_URL}" target="_blank" rel="noopener">© EEA, END 2022</a>`

/** The streets around the hotel, seen from above. */
const ZOOM = 16.3

/** The colour of a contour by its band's lower bound; the quiet (below 40 dB) has none. */
const FILL_COLOR: ExpressionSpecification = [
  'step',
  ['coalesce', ['get', 'db_min'], 0],
  NOISE_COLORS[0],
  ...LEGEND_STEPS.flatMap((step, i) => [step, NOISE_COLORS[i + 1]] as const),
]

const empty: NoiseMapData = { type: 'FeatureCollection', features: [] }

const placeName = (place: NoisyPlace) => place.name ?? 'Без названия'

/**
 * The EEA contours of `indicator` around the hotel on the city's flat map, the quiet below 40 dB green and the louder
 * above, under the labels; the hotel's pin and the loud places of OSM as dots, each opening its name, kind and
 * distance when pressed. `onFail` when the map cannot load (no WebGL, no tiles).
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
  // One element per place, made once a list: MapLibre moves it, React renders the dot into it.
  const elements = useMemo(() => places.map(() => document.createElement('div')), [places])
  const [popupElement] = useState(() => document.createElement('div'))
  const [selected, setSelected] = useState<number | null>(null)
  const popupId = useId()

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
          // A flat map: no tilt, no turn.
          pitch: 0,
          maxPitch: 0,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          // The page scrolls past the map: the wheel does not zoom it.
          scrollZoom: false,
          attributionControl: { compact: true, customAttribution: [MAP_ATTRIBUTION, EEA_ATTRIBUTION] },
        })
      } catch {
        // No WebGL.
        fail.current()
        return
      }
      instance.touchZoomRotate.disableRotation()
      instance.keyboard.disableRotation()
      let loaded = false
      const stopAttribution = manageAttribution(instance)
      instance.on('load', () => {
        loaded = true
        const layers = instance.getStyle().layers
        // The style's 3D buildings stand out of a flat map.
        for (const layer of layers)
          if (layer.type === 'fill-extrusion') instance.setLayoutProperty(layer.id, 'visibility', 'none')
        instance.addSource('noise', { type: 'geojson', data: empty })
        instance.addLayer(
          {
            id: 'noise',
            type: 'fill',
            source: 'noise',
            paint: { 'fill-color': FILL_COLOR, 'fill-opacity': 0.5, 'fill-antialias': false },
          },
          // Under the labels.
          layers.find((layer) => layer.type === 'symbol')?.id,
        )
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

  // The contours of the indicator, the quiet first and the louder above.
  useEffect(() => {
    if (!map) return
    const features = (contours ?? empty).features
      .filter((f) => f.properties.indicator === indicator)
      .sort((a, b) => (a.properties.db_min ?? 0) - (b.properties.db_min ?? 0))
    map
      .getSource<GeoJSONSource>('noise')
      ?.setData({ type: 'FeatureCollection', features } as Parameters<GeoJSONSource['setData']>[0])
  }, [map, contours, indicator])

  useEffect(() => {
    if (!map) return
    const markers = elements.map((element, i) =>
      new Marker({ element, anchor: 'center' }).setLngLat([places[i].lon, places[i].lat]).addTo(map),
    )
    return () => markers.forEach((marker) => marker.remove())
  }, [map, elements, places])

  const shown = selected === null ? undefined : places[selected]
  useEffect(() => {
    if (!map || !shown) return
    const popup = new Popup({
      offset: 14,
      maxWidth: '15rem',
      focusAfterOpen: false,
      // MapLibre's unlayered styles beat Tailwind's layers, hence the important flags.
      className:
        '[&_.maplibregl-popup-content]:rounded-xl! [&_.maplibregl-popup-content]:py-2! [&_.maplibregl-popup-content]:pr-8! [&_.maplibregl-popup-close-button]:size-7! [&_.maplibregl-popup-close-button]:rounded-full! [&_.maplibregl-popup-close-button]:text-lg!',
    })
      .setDOMContent(popupElement)
      .setLngLat([shown.lon, shown.lat])
      .addTo(map)
    const close = () => setSelected(null)
    popup.on('close', close)
    return () => {
      popup.off('close', close)
      popup.remove()
    }
  }, [map, shown, popupElement])

  return (
    <div
      ref={containerRef}
      className={cn('size-full', ATTRIBUTION_CLASS)}
      role="region"
      aria-label="Карта шума вокруг отеля"
    >
      {map &&
        places.map((place, i) => {
          const element = elements[i]
          if (!element) return null
          return createPortal(
            <button
              type="button"
              aria-label={`${placeName(place)}, ${NOISY_LABEL[place.category][0]}`}
              aria-expanded={selected === i}
              aria-describedby={selected === i ? popupId : undefined}
              onClick={(e) => {
                // The map's own click, which closes the popup, comes after React's: it is not the map's.
                e.stopPropagation()
                setSelected(i)
              }}
              onKeyDown={(e) => e.key === 'Escape' && setSelected(null)}
              className="relative block size-5 rounded-full border-2 border-white shadow-sm before:absolute before:-inset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              style={{ backgroundColor: noisyGroup(place.category).color }}
            />,
            element,
            `${place.category}-${place.lat}-${place.lon}`,
          )
        })}
      {shown &&
        createPortal(
          <span id={popupId} className="flex flex-col font-sans text-sm text-foreground">
            <b className="font-semibold">{placeName(shown)}</b>
            <span className="text-muted-foreground">
              {NOISY_LABEL[shown.category][0]} · {distanceLabel(shown.distanceM)} от отеля
            </span>
          </span>,
          popupElement,
        )}
    </div>
  )
}
