import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { projectToGlobe, type GlobeView } from '../../lib/globe'
import { landPath, polylines, type Project } from './globeRenderer'

/** Records a path as closed polygons, with arcs broken into short chords. */
class RecordedPath {
  polygons: number[][] = []
  moveTo(x: number, y: number) {
    this.polygons.push([x, y])
  }
  lineTo(x: number, y: number) {
    this.polygons.at(-1)!.push(x, y)
  }
  arc(cx: number, cy: number, r: number, from: number, to: number, anticlockwise: boolean) {
    let sweep = to - from
    if (anticlockwise) while (sweep > 0) sweep -= 2 * Math.PI
    else while (sweep < 0) sweep += 2 * Math.PI
    const steps = Math.max(1, Math.ceil(Math.abs(sweep) / 0.01))
    for (let k = 0; k <= steps; k++) {
      const a = from + (sweep * k) / steps
      this.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
    }
  }
  closePath() {}
}

/** Non-zero winding number of the polygons around (x, y), the rule the land is filled with. */
function winding(polygons: number[][], x: number, y: number) {
  let w = 0
  for (const p of polygons)
    for (let i = 0; i < p.length; i += 2) {
      const [x1, y1] = [p[i], p[i + 1]]
      const [x2, y2] = [p[(i + 2) % p.length], p[(i + 3) % p.length]]
      const side = (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1)
      if (y1 <= y && y2 > y && side > 0) w++
      else if (y1 > y && y2 <= y && side < 0) w--
    }
  return w
}

/** Whether (lon, lat) is on land, by the even-odd rule over the rings on the flat map. */
function onLand(rings: number[][], lon: number, lat: number) {
  let inside = false
  for (const ring of rings)
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const [x1, y1, x2, y2] = [ring[j] / 10, ring[j + 1] / 10, ring[i] / 10, ring[i + 1] / 10]
      if (y1 > lat !== y2 > lat && lon < x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1)) inside = !inside
    }
  return inside
}

describe('landPath', () => {
  const { land: rings }: { land: number[][] } = JSON.parse(readFileSync('public/data/globe.json', 'utf8'))
  const land = polylines(rings)
  const ring = new Float32Array(3 * Math.max(...rings.map((r) => r.length / 2)))
  const R = 500

  beforeAll(() => vi.stubGlobal('Path2D', RecordedPath))
  afterAll(() => vi.unstubAllGlobals())

  // hero-globe, Requirement: Цвета Земли
  it.each<GlobeView>([
    { lat: 30, lon: 20 },
    { lat: -10, lon: -160 },
    { lat: 0, lon: 180 },
    { lat: 70, lon: 100 },
    { lat: -70, lon: 0 },
    { lat: 45, lon: -100 },
    // Each of these cut a degenerate or self-crossing ring of the old geometry at the horizon: closed along the
    // whole limb, it filled the ocean with land for a frame, the green flash at the edge of the spinning globe.
    { lat: 45, lon: 59.76 },
    { lat: 45, lon: -121.54 },
    { lat: 25, lon: -2.4 },
    { lat: -20, lon: -161.87 },
  ])('fills exactly the visible land in view %o', (view) => {
    const project: Project = (p, i, out) => {
      const g = projectToGlobe(
        (Math.asin(p[i + 2]) * 180) / Math.PI,
        (Math.atan2(p[i + 1], p[i]) * 180) / Math.PI,
        view,
      )
      out.x = (g.x / 50) * R
      out.y = (g.y / 50) * R
      out.depth = g.depth
    }
    const { polygons } = landPath(land, ring, R, project) as unknown as RecordedPath

    const [s0, c0] = [Math.sin((view.lat * Math.PI) / 180), Math.cos((view.lat * Math.PI) / 180)]
    let samples = 0
    let wrong = 0
    for (let u = -0.98; u < 1; u += 0.04)
      for (let v = -0.98; v < 1; v += 0.04) {
        const depth = 1 - u * u - v * v
        if (depth <= 0.01) continue
        const z = Math.sqrt(depth)
        // The inverse of the orthographic projection: the point on the sphere under (u, v), v up.
        const lat = (Math.asin(c0 * v + s0 * z) * 180) / Math.PI
        const lon = ((view.lon + (Math.atan2(u, c0 * z - s0 * v) * 180) / Math.PI + 540) % 360) - 180
        samples++
        if ((winding(polygons, R + u * R, R - v * R) !== 0) !== onLand(rings, lon, lat)) wrong++
      }
    // Straight chords on screen differ from the coast between its vertices only along the very coastline.
    expect(wrong / samples).toBeLessThan(0.01)
  })
})

/** Sign of the turn from (ax, ay)→(bx, by) to (cx, cy). */
const turn = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax))

/** Whether the segments a–b and c–d cross at a point inside both. */
const cross = (a: number[], b: number[], c: number[], d: number[]) =>
  turn(a[0], a[1], b[0], b[1], c[0], c[1]) * turn(a[0], a[1], b[0], b[1], d[0], d[1]) < 0 &&
  turn(c[0], c[1], d[0], d[1], a[0], a[1]) * turn(c[0], c[1], d[0], d[1], b[0], b[1]) < 0

// hero-globe, Requirement: Цвета Земли
describe('land geometry', () => {
  const { land: rings }: { land: number[][] } = JSON.parse(readFileSync('public/data/globe.json', 'utf8'))
  const edges = rings.map((ring) =>
    Array.from({ length: ring.length / 2 }, (_, k) => {
      const next = (2 * k + 2) % ring.length
      return [
        [ring[2 * k], ring[2 * k + 1]],
        [ring[next], ring[next + 1]],
      ]
    }),
  )

  // landPath() closes a cut ring along the limb on the side the land lies: a ring with no area or crossing
  // itself or another one has no such side, and the fill went round the whole disc.
  it('has rings with area that cross neither themselves nor each other', () => {
    for (const ring of rings) {
      let area = 0
      for (let i = 0; i < ring.length; i += 2) {
        const j = (i + 2) % ring.length
        area += ring[i] * ring[j + 1] - ring[j] * ring[i + 1]
      }
      expect(area).not.toBe(0)
    }
    const boxes = rings.map((ring) => {
      const lons = ring.filter((_, i) => i % 2 === 0)
      const lats = ring.filter((_, i) => i % 2 === 1)
      return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
    })
    const crossings: string[] = []
    for (let a = 0; a < rings.length; a++)
      for (let b = a; b < rings.length; b++) {
        const [p, q] = [boxes[a], boxes[b]]
        if (p[0] > q[2] || q[0] > p[2] || p[1] > q[3] || q[1] > p[3]) continue
        edges[a].forEach(([e1, e2], i) =>
          edges[b].forEach(([f1, f2], j) => {
            if ((a !== b || j > i) && cross(e1, e2, f1, f2)) crossings.push(`ring ${a} edge ${i} × ring ${b} edge ${j}`)
          }),
        )
      }
    expect(crossings).toEqual([])
  })
})
