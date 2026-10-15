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
