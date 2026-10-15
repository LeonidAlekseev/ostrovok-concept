/** A point on the unit sphere in the globe's own coordinates (x towards 0°E, z towards the north pole). */
export type Vec3 = [number, number, number]

/** A plane cruising along a great circle; `axis` is the circle's normal, so the course is axis × pos. */
export interface Plane {
  pos: Vec3
  axis: Vec3
  /** Radians per second. */
  speed: number
  /** Set while the plane is behind the globe and has already been given a new course. */
  rerouted: boolean
}

/** Cruise speeds, degrees of arc per second. */
const MIN_SPEED = 4
const MAX_SPEED = 8

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** Uniformly distributed point on the sphere. */
const randomPoint = (): Vec3 => {
  const z = Math.random() * 2 - 1
  const t = Math.random() * 2 * Math.PI
  const r = Math.sqrt(1 - z * z)
  return [r * Math.cos(t), r * Math.sin(t), z]
}

export function createPlanes(count: number): Plane[] {
  return Array.from({ length: count }, () => {
    const plane: Plane = { pos: randomPoint(), axis: [0, 0, 1], speed: 0, rerouted: false }
    reroute(plane)
    return plane
  })
}

/** Gives the plane a random new course (and speed) through its current position. */
export function reroute(plane: Plane) {
  plane.axis = normalize(cross(plane.pos, randomPoint()))
  plane.speed = ((MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED)) * Math.PI) / 180
}

/** The point `angle` radians further along the plane's course (behind it when negative). */
export function ahead({ pos, axis }: Plane, angle: number): Vec3 {
  const t = cross(axis, pos)
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [pos[0] * c + t[0] * s, pos[1] * c + t[1] * s, pos[2] * c + t[2] * s]
}

export function advance(planes: Plane[], dt: number) {
  for (const plane of planes) plane.pos = normalize(ahead(plane, plane.speed * dt))
}
