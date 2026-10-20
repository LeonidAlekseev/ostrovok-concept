// Turbopack turns `new URL('./' + name, import.meta.url)` inside maplibre-gl.mjs into assets for every
// file of maplibre-gl/dist (~5 MB of .mjs). The app always sets the worker URL itself (SearchMap.tsx),
// so the library's own default lookup can be pointed at a base that is never resolved.
module.exports = function maplibreNoAssetGlob(source) {
  return source.replaceAll('import.meta.url', '"https://maplibre.invalid/"')
}
