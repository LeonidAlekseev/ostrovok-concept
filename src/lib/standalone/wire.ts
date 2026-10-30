import type { Overlay } from './store'

/**
 * How the browser's rows travel with a request of the standalone demo and what the route wrote comes back: in a JSON
 * body the request's own body goes under `body` beside `OVERLAY_FIELD`; a request without one (GET) carries them in
 * `OVERLAY_HEADER`, gzipped and in base64. The response's own body ends with `TRAILER` and the route's changes.
 */
export const OVERLAY_FIELD = '__standaloneDb'
export const OVERLAY_HEADER = 'x-standalone-db'
/** Record separator and a word no JSON or event stream of the site contains. */
export const TRAILER = '\u001e\u001estandalone-db\u001e'

const toBase64 = (bytes: Uint8Array) => {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export async function encodeOverlay(overlay: Overlay): Promise<string> {
  return toBase64(await pipe(new TextEncoder().encode(JSON.stringify(overlay)), new CompressionStream('gzip')))
}

export async function decodeOverlay(value: string): Promise<Overlay> {
  try {
    const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip')))) as Overlay
  } catch {
    return {}
  }
}
