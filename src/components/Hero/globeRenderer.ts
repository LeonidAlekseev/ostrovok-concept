import type { GlobeView } from '../../lib/globe'
import { advance, ahead, createFlyers, reroute, type Flyer, type Vec3 } from './globeFlyers'

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
/** Planes cruise slowly, balloons drift slower still; speeds in degrees of arc per second. */
const PLANE_COUNT = 9
const PLANE_SPEEDS: Flyer['speeds'] = [0.8, 1.6]
const BALLOON_COUNT = 4
const BALLOON_SPEEDS: Flyer['speeds'] = [0.2, 0.45]
/** Plane length and balloon height as fractions of the globe's diameter; contrail length, radians of arc. */
const PLANE_SIZE = 0.034
const BALLOON_SIZE = 0.036
const TRAIL_ANGLE = 0.12
const FLYER_COLOR = '#fff'
/** Planes and balloons are slightly see-through, so they never outshine the globe and the pins. */
const FLYER_ALPHA = 0.75
/** Planes and balloons fade out smoothly between these depths as they near the horizon. */
const FADE_FROM = 0.02
const FADE_TO = 0.35
const fade = (depth: number) => {
  const t = Math.min(Math.max((depth - FADE_FROM) / (FADE_TO - FADE_FROM), 0), 1)
  return t * t * (3 - 2 * t)
}
/** A soft shadow keeps the white figures readable over the white dots. */
const FLYER_SHADOW = 'rgba(20, 70, 10, 0.25)'
/** Chubby toy plane seen from above on a 24×24 grid, nose up: round nose, rounded wings and tail. */
const PLANE_PATH =
  'M12 1.5c1.6 0 2.4 1.6 2.4 3.4V9l6.6 3.6c.6.3 1 .9 1 1.6v.9c0 .5-.5.9-1 .7L14.4 14v3.8l2.3 1.7c.3.2.5.6.5 1v.6c0 .4-.4.7-.8.6L12 20.6l-4.4 1.1c-.4.1-.8-.2-.8-.6v-.6c0-.4.2-.8.5-1l2.3-1.7V14l-6.6 1.8c-.5.2-1-.2-1-.7v-.9c0-.7.4-1.3 1-1.6L9.6 9V4.9c0-1.8.8-3.4 2.4-3.4Z'
/** Minimal hot-air balloon on a 24×28 grid: envelope, ropes and basket. */
const BALLOON_PATH =
  'M12 1C6.5 1 2.5 5 2.5 10c0 4.6 4.3 8.2 7 11h5c2.7-2.8 7-6.4 7-11C21.5 5 17.5 1 12 1ZM9.6 21h.9v3h-.9ZM13.5 21h.9v3h-.9ZM9.3 24h5.4v3.2H9.3Z'

export interface GlobeFrame {
  view: GlobeView
  /** Canvas size, CSS pixels. */
  size: number
  /** Top fraction of the canvas that is on screen; only it is drawn. */
  visibleFraction: number
  /** Canvas pixels per CSS pixel. */
  pixelRatio: number
  /** Seconds the planes and balloons fly since the previous frame; 0 holds them still. */
  dt: number
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
  const planes = createFlyers(PLANE_COUNT, PLANE_SPEEDS)
  const balloons = createFlyers(BALLOON_COUNT, BALLOON_SPEEDS)
  const planePath = new Path2D(PLANE_PATH)
  const balloonPath = new Path2D(BALLOON_PATH)
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

  return {
    ready,
    draw({ view, size, visibleFraction, pixelRatio, dt }) {
      const px = Math.round(size * pixelRatio)
      const visible = Math.ceil(px * Math.min(Math.max(visibleFraction, 0), 1))
      // A standing globe with standing flyers (reduced motion) costs nothing at all.
      const key = `${view.lon}/${view.lat}/${px}/${visible}`
      if (dt === 0 && key === drawn && canvas.width === px) return false
      advance(planes, dt)
      advance(balloons, dt)
      drawn = key
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px
        canvas.height = px
      }
      ctx.clearRect(0, 0, px, px)

      const c = (view.lon * Math.PI) / 180
      const cc = Math.cos(c)
      const sc = Math.sin(c)
      const lat0 = (view.lat * Math.PI) / 180
      const sin0 = Math.sin(lat0)
      const cos0 = Math.cos(lat0)
      const r = px / 2
      // Orthographic projection, the same as projectToGlobe() in src/lib/globe.ts.
      const projectPoint = (a: number, b: number, s: number, out: { x: number; y: number; depth: number }) => {
        const cosLon = a * cc + b * sc
        out.x = r + (b * cc - a * sc) * r
        out.y = r - (cos0 * s - sin0 * cosLon) * r
        out.depth = sin0 * s + cos0 * cosLon
      }
      const project = (p: Float32Array, i: number, out: { x: number; y: number; depth: number }) =>
        projectPoint(p[i], p[i + 1], p[i + 2], out)
      const projectVec = (v: Vec3, out: { x: number; y: number; depth: number }) => projectPoint(v[0], v[1], v[2], out)
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

      /** Projects a flyer into `q`; returns its opacity, 0 when it is out of sight. */
      const place = (flyer: Flyer, size: number) => {
        projectVec(flyer.pos, q)
        // Behind the globe each flyer picks a new random course, so the flights never repeat.
        if (q.depth < -0.3 && !flyer.rerouted) {
          reroute(flyer)
          flyer.rerouted = true
        } else if (q.depth > 0) flyer.rerouted = false
        if (q.depth < FADE_FROM || q.y > visible + size) return 0
        return FLYER_ALPHA * fade(q.depth)
      }

      ctx.fillStyle = FLYER_COLOR
      ctx.shadowColor = FLYER_SHADOW
      ctx.shadowBlur = 3 * pixelRatio
      ctx.shadowOffsetY = pixelRatio
      // Balloons first: the planes fly above them. They stay upright whatever their course.
      const balloonScale = (BALLOON_SIZE * px) / 28
      for (const balloon of balloons) {
        const alpha = place(balloon, BALLOON_SIZE * px)
        if (!alpha) continue
        ctx.globalAlpha = alpha
        ctx.setTransform(balloonScale, 0, 0, balloonScale, q.x, q.y)
        ctx.translate(-12, -14)
        ctx.fill(balloonPath)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
      }

      const head = { x: 0, y: 0, depth: 0 }
      const tail = { x: 0, y: 0, depth: 0 }
      const scale = (PLANE_SIZE * px) / 24
      ctx.lineCap = 'round'
      ctx.lineWidth = 1.5 * pixelRatio
      for (const plane of planes) {
        const alpha = place(plane, PLANE_SIZE * px)
        if (!alpha) continue
        ctx.globalAlpha = alpha
        // The contrail goes without a shadow, as a faint streak.
        ctx.shadowColor = 'transparent'

        projectVec(ahead(plane, -TRAIL_ANGLE), tail)
        const trail = ctx.createLinearGradient(q.x, q.y, tail.x, tail.y)
        trail.addColorStop(0, 'rgba(255, 255, 255, 0.9)')
        trail.addColorStop(1, 'rgba(255, 255, 255, 0)')
        ctx.beginPath()
        ctx.moveTo(q.x, q.y)
        for (let k = 1; k <= 6; k++) {
          projectVec(ahead(plane, (-TRAIL_ANGLE * k) / 6), tail)
          // Past the horizon the contrail would fold back onto the visible disc.
          if (tail.depth < FADE_FROM) break
          ctx.lineTo(tail.x, tail.y)
        }
        ctx.strokeStyle = trail
        ctx.stroke()
        ctx.shadowColor = FLYER_SHADOW

        projectVec(ahead(plane, 0.01), head)
        const angle = Math.atan2(head.y - q.y, head.x - q.x) + Math.PI / 2
        ctx.setTransform(scale, 0, 0, scale, q.x, q.y)
        ctx.rotate(angle)
        ctx.translate(-12, -12)
        ctx.fill(planePath)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
      }
      ctx.globalAlpha = 1
      ctx.shadowColor = 'transparent'
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

/** Meridians and parallels, in the same tenths-of-a-degree format. */
function graticule(): number[][] {
  const lines: number[][] = []
  const range = (from: number, to: number, step: number) =>
    Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step)
  for (const lon of range(-180, 180 - GRID_STEP, GRID_STEP))
    lines.push(range(-90, 90, GRID_SAMPLE).flatMap((lat) => [lon * 10, lat * 10]))
  for (const lat of range(GRID_STEP - 90, 90 - GRID_STEP, GRID_STEP))
    lines.push(range(-180, 180, GRID_SAMPLE).flatMap((lon) => [lon * 10, lat * 10]))
  return lines
}
