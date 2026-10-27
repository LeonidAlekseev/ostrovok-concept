import { setWorkerUrl, type Map as MapLibreMap } from 'maplibre-gl'

/** What the MapLibre maps share: the results map, the hotel on the map and the map of Эвал's answer. */

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

/**
 * The attribution of every map: the style's sources credit no one (`silenceSourceAttribution`), the
 * credit shows after the load and folds into its "i" after `ATTRIBUTION_SHOWN_MS` or on the first interaction. Call
 * right after the map is made, with `ATTRIBUTION_CLASS` on its container; returns the cleanup.
 */
export function manageAttribution(map: MapLibreMap): () => void {
  let foldTimer: ReturnType<typeof setTimeout> | undefined
  const fold = () => {
    clearTimeout(foldTimer)
    foldAttribution(map)
  }
  map.on('styledata', () => silenceSourceAttribution(map))
  map.once('load', () => {
    foldTimer = setTimeout(fold, ATTRIBUTION_SHOWN_MS)
    for (const type of ['mousedown', 'touchstart', 'wheel'] as const) map.once(type, fold)
  })
  return () => clearTimeout(foldTimer)
}

// The attribution of every map: a small white pill, the credit in medium black text, and one black round "i" on its
// right, folded or not (MapLibre's own "i" is a ringed glyph on grey). MapLibre's unlayered styles beat Tailwind's
// layers, hence the important flags.
export const ATTRIBUTION_CLASS = [
  '[&_.maplibregl-ctrl-attrib]:m-2! [&_.maplibregl-ctrl-attrib]:rounded-full! [&_.maplibregl-ctrl-attrib]:bg-white! [&_.maplibregl-ctrl-attrib]:text-xs! [&_.maplibregl-ctrl-attrib]:leading-6!',
  '[&_.maplibregl-ctrl-attrib.maplibregl-compact]:min-h-6! [&_.maplibregl-ctrl-attrib.maplibregl-compact]:p-0! [&_.maplibregl-ctrl-attrib.maplibregl-compact]:pr-6!',
  '[&_.maplibregl-ctrl-attrib.maplibregl-compact-show]:py-0! [&_.maplibregl-ctrl-attrib.maplibregl-compact-show]:pr-7! [&_.maplibregl-ctrl-attrib.maplibregl-compact-show]:pl-2.5!',
  '[&_.maplibregl-ctrl-attrib_a]:font-medium! [&_.maplibregl-ctrl-attrib_a]:text-black!',
  '[&_.maplibregl-ctrl-attrib-button]:top-0! [&_.maplibregl-ctrl-attrib-button]:right-0! [&_.maplibregl-ctrl-attrib-button]:left-auto! [&_.maplibregl-ctrl-attrib-button]:size-6! [&_.maplibregl-ctrl-attrib-button]:rounded-full! [&_.maplibregl-ctrl-attrib-button]:bg-black! [&_.maplibregl-ctrl-attrib-button]:bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2724%27%20height=%2724%27%20viewBox=%270%200%2024%2024%27%20fill=%27white%27%3E%3Ccircle%20cx=%2712%27%20cy=%277.5%27%20r=%271.4%27/%3E%3Crect%20x=%2710.8%27%20y=%2710.5%27%20width=%272.4%27%20height=%276.5%27%20rx=%271.2%27/%3E%3C/svg%3E")]!',
].join(' ')
