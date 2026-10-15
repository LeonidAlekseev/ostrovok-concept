import { GLOBE_CENTER } from '../../lib/globe'

/** Southern edge of the drawn globe (keep in sync with LAT_MIN in scripts/build-globe.py). */
const LAT_MIN = -20
/** Spacing of the latitude/longitude grid and the step its lines are sampled with, degrees. */
const GRID_STEP = 15
const GRID_SAMPLE = 2
/** Side of a land dot, CSS pixels. */
const DOT_SIZE = 1.8
/** Dots are batched into a few opacity levels by how squarely they face the viewer. */
const DOT_LEVELS = [
  { depth: 0.05, alpha: 0.3 },
  { depth: 0.25, alpha: 0.6 },
  { depth: 0.5, alpha: 0.95 },
]
const GRID_STYLE = 'rgba(255, 255, 255, 0.4)'
const COAST_STYLE = 'rgba(255, 255, 255, 0.85)'

export interface GlobeFrame {
  centerLon: number
  /** Canvas size, CSS pixels. */
  size: number
  /** Top fraction of the canvas that is on screen; only it is drawn. */
  visibleFraction: number
  /** Canvas pixels per CSS pixel. */
  pixelRatio: number
}

export interface GlobeRenderer {
  /** Resolves once the geometry is loaded and frames can be drawn. */
  ready: Promise<void>
  /** Draws a frame; returns false when nothing changed since the previous one and drawing was skipped. */
  draw(frame: GlobeFrame): boolean
  /** Geometry and canvas details for the technical overlay. */
  describe(): { geometry: string; canvas: string }
  dispose(): void
}

/**
 * Points on the unit sphere as (cosφ·cosλ, cosφ·sinλ, sinφ) triples: turning the globe then needs
 * no trigonometry per point, only the sine and cosine of the view longitude.
 */
interface Polylines {
  points: Float32Array
  /** Index of each polyline's first point, plus the total count at the end. */
  starts: number[]
}

/** Dotted wireframe globe drawn with Canvas 2D: land dots, coastlines and a latitude/longitude grid. */
export function createGlobeRenderer(canvas: HTMLCanvasElement, url: string): GlobeRenderer | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const grid = polylines(graticule())
  let dots: Float32Array = new Float32Array()
  let coast: Polylines = { points: new Float32Array(), starts: [0] }
  let drawn = ''
  const controller = new AbortController()

  const ready = (async () => {
    const response = await fetch(url, { signal: controller.signal }).catch((error: unknown) => {
      // Disposed before the geometry arrived: nothing will be drawn, so this is not an error.
      if (controller.signal.aborted) return null
      throw error
    })
    if (!response) return
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    const data: { dots: number[]; lines: number[][] } = await response.json()
    dots = toSphere(data.dots)
    coast = polylines(data.lines)
  })()

  const lat0 = (GLOBE_CENTER.lat * Math.PI) / 180
  const sin0 = Math.sin(lat0)
  const cos0 = Math.cos(lat0)

  return {
    ready,
    draw({ centerLon, size, visibleFraction, pixelRatio }) {
      const px = Math.round(size * pixelRatio)
      const visible = Math.ceil(px * Math.min(Math.max(visibleFraction, 0), 1))
      // A standing globe (hover, reduced motion) costs nothing at all.
      const key = `${centerLon}/${px}/${visible}`
      if (key === drawn && canvas.width === px) return false
      drawn = key
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px
        canvas.height = px
      }
      ctx.clearRect(0, 0, px, px)

      const c = (centerLon * Math.PI) / 180
      const cc = Math.cos(c)
      const sc = Math.sin(c)
      const r = px / 2
      // Orthographic projection, the same as projectToGlobe() in src/lib/globe.ts.
      const project = (p: Float32Array, i: number, out: { x: number; y: number; depth: number }) => {
        const a = p[i]
        const b = p[i + 1]
        const s = p[i + 2]
        const cosLon = a * cc + b * sc
        out.x = r + (b * cc - a * sc) * r
        out.y = r - (cos0 * s - sin0 * cosLon) * r
        out.depth = sin0 * s + cos0 * cosLon
      }
      const q = { x: 0, y: 0, depth: 0 }

      ctx.lineWidth = pixelRatio
      ctx.lineJoin = 'round'
      for (const [lines, style] of [
        [grid, GRID_STYLE],
        [coast, COAST_STYLE],
      ] as const) {
        ctx.beginPath()
        for (let l = 0; l + 1 < lines.starts.length; l++) {
          let pen = false
          for (let i = lines.starts[l]; i < lines.starts[l + 1]; i++) {
            project(lines.points, i * 3, q)
            // Lines break where they pass behind the limb.
            if (q.depth < 0 || q.y > visible + r * 0.05) pen = false
            else if (pen) ctx.lineTo(q.x, q.y)
            else {
              ctx.moveTo(q.x, q.y)
              pen = true
            }
          }
        }
        ctx.strokeStyle = style
        ctx.stroke()
      }

      const side = DOT_SIZE * pixelRatio
      ctx.fillStyle = '#fff'
      DOT_LEVELS.forEach(({ depth, alpha }, level) => {
        const until = DOT_LEVELS[level + 1]?.depth ?? Infinity
        ctx.beginPath()
        for (let i = 0; i < dots.length; i += 3) {
          project(dots, i, q)
          if (q.depth >= depth && q.depth < until && q.y < visible + side) ctx.rect(q.x - side / 2, q.y - side / 2, side, side)
        }
        ctx.globalAlpha = alpha
        ctx.fill()
      })
      ctx.globalAlpha = 1
      return true
    },
    describe() {
      const vertices = coast.starts.at(-1)! + grid.starts.at(-1)!
      return {
        geometry: `${dots.length / 3} dots · ${vertices} line vertices`,
        canvas: `${canvas.width}×${canvas.height}`,
      }
    },
    dispose() {
      controller.abort()
    },
  } satisfies GlobeRenderer
}

/** Converts flat [lon, lat, …] pairs in tenths of a degree to unit-sphere triples. */
function toSphere(coords: number[]): Float32Array {
  const out = new Float32Array((coords.length / 2) * 3)
  for (let i = 0, j = 0; i < coords.length; i += 2, j += 3) {
    const lon = (coords[i] / 10) * (Math.PI / 180)
    const lat = (coords[i + 1] / 10) * (Math.PI / 180)
    out[j] = Math.cos(lat) * Math.cos(lon)
    out[j + 1] = Math.cos(lat) * Math.sin(lon)
    out[j + 2] = Math.sin(lat)
  }
  return out
}

function polylines(lines: number[][]): Polylines {
  const starts = [0]
  for (const line of lines) starts.push(starts.at(-1)! + line.length / 2)
  return { points: toSphere(lines.flat()), starts }
}

/** Meridians and parallels over the drawn part of the globe, in the same tenths-of-a-degree format. */
function graticule(): number[][] {
  const lines: number[][] = []
  const range = (from: number, to: number, step: number) =>
    Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step)
  for (const lon of range(-180, 180 - GRID_STEP, GRID_STEP))
    lines.push(range(LAT_MIN, 90, GRID_SAMPLE).flatMap((lat) => [lon * 10, lat * 10]))
  for (const lat of range(-15, 90 - GRID_STEP, GRID_STEP))
    lines.push(range(-180, 180, GRID_SAMPLE).flatMap((lon) => [lon * 10, lat * 10]))
  return lines
}
