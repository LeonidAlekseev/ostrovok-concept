import type { Destination } from '../../data/destinations'
import { projectToGlobe } from '../../lib/globe'

export interface Point {
  x: number
  y: number
}

export interface Route {
  id: string
  from: Point
  control: Point
  to: Point
}

export interface Marker {
  destination: Destination
  point: Point
}

export function globeMarkers(list: Destination[]): Marker[] {
  return list.flatMap((destination) => {
    const p = projectToGlobe(destination.lat, destination.lon)
    return p.visible ? [{ destination, point: { x: p.x, y: p.y } }] : []
  })
}

/** Quadratic arc between two points, bowed away from the globe centre like a flight path. */
export function arc(id: string, from: Point, to: Point, lift = 0.22): Route {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  // Of the two normals pick the one pointing "up" (away from the bottom of the globe).
  let nx = -dy / len
  let ny = dx / len
  if (ny > 0) {
    nx = -nx
    ny = -ny
  }
  return { id, from, to, control: { x: mid.x + nx * len * lift, y: mid.y + ny * len * lift } }
}

export function routePath({ from, control, to }: Route): string {
  return `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`
}

/** Point and heading (degrees, 0 = pointing right) on a route at parameter t. */
export function pointOnRoute({ from, control, to }: Route, t: number): Point & { angle: number } {
  const u = 1 - t
  const x = u * u * from.x + 2 * u * t * control.x + t * t * to.x
  const y = u * u * from.y + 2 * u * t * control.y + t * t * to.y
  const tx = 2 * u * (control.x - from.x) + 2 * t * (to.x - control.x)
  const ty = 2 * u * (control.y - from.y) + 2 * t * (to.y - control.y)
  return { x, y, angle: (Math.atan2(ty, tx) * 180) / Math.PI }
}
