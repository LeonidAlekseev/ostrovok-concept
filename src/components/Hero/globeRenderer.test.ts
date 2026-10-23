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
