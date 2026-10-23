import { setWorkerUrl, type Map as MapLibreMap } from 'maplibre-gl'

/** What the MapLibre maps share: the results map and the hotel on the map. */

// MapLibre looks for its worker next to its own module, which the bundler moves: point it to the file.
setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href)

/** Free vector tiles without a key; the style credits OpenFreeMap, OpenMapTiles and OpenStreetMap. */
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

/** The attribution is shown in full this long after the map loads, then folds into its "i" button. */
export const ATTRIBUTION_SHOWN_MS = 5000

/**
 * Folds the compact attribution into its "i" button the way pressing it does. The OSMF rules let an
 * interactive map fold it only after showing it: on the first interaction or after a few seconds.
 */
export function foldAttribution(map: MapLibreMap) {
  map.getContainer().querySelector<HTMLElement>('.maplibregl-compact-show > .maplibregl-ctrl-attrib-button')?.click()
}
