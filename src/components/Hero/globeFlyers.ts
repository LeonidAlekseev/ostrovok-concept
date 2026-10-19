/** A point on the unit sphere in the globe's own coordinates (x towards 0°E, z towards the north pole). */
export type Vec3 = [number, number, number]

/** Something drifting along a great circle (a plane, a balloon); `axis` is the circle's normal, so the course is axis × pos. */
export interface Flyer {
  pos: Vec3
  axis: Vec3
  /** Radians per second. */
  speed: number
  /** Range the speed is picked from, degrees of arc per second. */
  speeds: [min: number, max: number]
  /** Set while the flyer is behind the globe and has already been given a new course. */
  rerouted: boolean
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

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

export function createFlyers(count: number, speeds: Flyer['speeds']): Flyer[] {
  return Array.from({ length: count }, () => {
    const flyer: Flyer = { pos: randomPoint(), axis: [0, 0, 1], speed: 0, speeds, rerouted: false }
    reroute(flyer)
    return flyer
  })
}

/** Gives the flyer a random new course (and speed) through its current position. */
export function reroute(flyer: Flyer) {
  const [min, max] = flyer.speeds
  flyer.axis = normalize(cross(flyer.pos, randomPoint()))
  flyer.speed = ((min + Math.random() * (max - min)) * Math.PI) / 180
}

/** The point `angle` radians further along the flyer's course (behind it when negative). */
export function ahead({ pos, axis }: Flyer, angle: number): Vec3 {
  const t = cross(axis, pos)
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [pos[0] * c + t[0] * s, pos[1] * c + t[1] * s, pos[2] * c + t[2] * s]
}

export function advance(flyers: Flyer[], dt: number) {
  for (const flyer of flyers) flyer.pos = normalize(ahead(flyer, flyer.speed * dt))
}
