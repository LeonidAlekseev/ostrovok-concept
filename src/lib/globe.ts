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
