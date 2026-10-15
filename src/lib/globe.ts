/**
 * Orthographic projection matching the pre-rendered globe image
 * (keep in sync with LAT0/LON0 in scripts/build-images.py).
 */
export const GLOBE_CENTER = { lat: 10, lon: 15 }

const rad = Math.PI / 180

export interface GlobePoint {
  /** 0…100, percent of the globe box from the left. */
  x: number
  /** 0…100, percent of the globe box from the top. */
  y: number
  visible: boolean
}

export function projectToGlobe(lat: number, lon: number): GlobePoint {
  const φ = lat * rad
  const λ = (lon - GLOBE_CENTER.lon) * rad
  const φ0 = GLOBE_CENTER.lat * rad
  const cosc = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(λ)
  const px = Math.cos(φ) * Math.sin(λ)
  const py = Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(λ)
  return { x: (1 + px) * 50, y: (1 - py) * 50, visible: cosc > 0 }
}
