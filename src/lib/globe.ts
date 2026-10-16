/** Point of the globe facing the viewer, degrees. */
export interface GlobeView {
  lat: number
  lon: number
}

/** Orthographic projection of the hero globe; GLOBE_CENTER is the initial view. */
export const GLOBE_CENTER: GlobeView = { lat: 25, lon: 50 }

const rad = Math.PI / 180

export interface GlobePoint {
  /** 0…100, percent of the globe box from the left. */
  x: number
  /** 0…100, percent of the globe box from the top. */
  y: number
  /** Cosine of the angle to the view centre: 1 facing the viewer, 0 at the limb, < 0 on the far side. */
  depth: number
}

export function projectToGlobe(lat: number, lon: number, view: GlobeView = GLOBE_CENTER): GlobePoint {
  const φ = lat * rad
  const λ = (lon - view.lon) * rad
  const φ0 = view.lat * rad
  const depth = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(λ)
  const px = Math.cos(φ) * Math.sin(λ)
  const py = Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(λ)
  return { x: (1 + px) * 50, y: (1 - py) * 50, depth }
}

/**
 * The view that puts the point (lat, lon) at (u, v) on the globe's disc (−1…1 from the centre, v up)
 * with the view latitude within ±maxTilt, or null when no such view exists. Inverse of projectToGlobe().
 */
export function viewPlacing(lat: number, lon: number, u: number, v: number, maxTilt: number): GlobeView | null {
  const φ = lat * rad
  const sinλ = u / Math.cos(φ)
  if (Math.abs(sinλ) > 1) return null
  const λ = Math.asin(sinλ)
  // v = a·cosφ0 − b·sinφ0 = r·cos(φ0 + δ)
  const a = Math.sin(φ)
  const b = Math.cos(φ) * Math.cos(λ)
  const r = Math.hypot(a, b)
  if (Math.abs(v) > r) return null
  const δ = Math.atan2(b, a)
  for (const φ0 of [Math.acos(v / r) - δ, -Math.acos(v / r) - δ]) {
    const depth = a * Math.sin(φ0) + b * Math.cos(φ0)
    if (depth > 0 && Math.abs(φ0) <= maxTilt * rad) return { lat: φ0 / rad, lon: lon - λ / rad }
  }
  return null
}
