import { setWorkerUrl, type Map as MapLibreMap } from 'maplibre-gl'

/** What the MapLibre maps share: the results map and the hotel on the map. */

// MapLibre looks for its worker next to its own module, which the bundler moves: point it to the file.
setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href)

/** Free vector tiles without a key. */
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

/** The only credit the map shows: the style's own list (OpenFreeMap, OpenMapTiles, ...) is dropped. */
export const MAP_ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>'

/**
 * Keeps the style's sources from crediting anyone but `MAP_ATTRIBUTION`. A source takes its credit from its TileJSON
 * once that loads, so it cannot be dropped from the style: the property of each source is made to ignore writes.
 * Idempotent, so it runs on every style load.
 */
export function silenceSourceAttribution(map: MapLibreMap) {
  for (const id of Object.keys(map.getStyle().sources)) {
    const source = map.getSource(id)
    if (source)
      Object.defineProperty(source, 'attribution', { get: () => undefined, set: () => {}, configurable: true })
  }
}

/** The attribution is shown in full this long after the map loads, then folds into its "i" button. */
export const ATTRIBUTION_SHOWN_MS = 5000

/**
 * Folds the compact attribution into its "i" button the way pressing it does. The OSMF rules let an
 * interactive map fold it only after showing it: on the first interaction or after a few seconds.
 */
export function foldAttribution(map: MapLibreMap) {
  map.getContainer().querySelector<HTMLElement>('.maplibregl-compact-show > .maplibregl-ctrl-attrib-button')?.click()
}
