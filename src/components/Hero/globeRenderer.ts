import { globeCities } from '../../data/globeCities'
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
/** The land under the dots; the CSS shading over the canvas lights and darkens it with the ocean. */
const LAND_STYLE = '#86d264'
const GRID_STYLE = 'rgba(255, 255, 255, 0.22)'
const COAST_STYLE = 'rgba(255, 255, 255, 0.7)'
/** City dots in the brand blue (--brand-blue): a capital is bigger and ringed in white, a resort is small and plain. */
const CITY_STYLE = '#0645e8'
const CAPITAL_RADIUS = 3.6
const CAPITAL_RING = 1.4
const RESORT_RADIUS = 2.4
/** City dots dim towards the limb in steps, like the land dots. */
const CITY_LEVELS = [
  { depth: 0.05, alpha: 0.35 },
  { depth: 0.2, alpha: 0.7 },
  { depth: 0.4, alpha: 1 },
]
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
const FLYER_ALPHA = 0.8
/**
 * Planes and balloons fade out smoothly between these depths as they near the horizon. Depth 0.6 is
 * at 80% of the radius from the centre: a narrower band would be too thin to notice the fading.
 */
const FADE_FROM = 0
const FADE_TO = 0.6
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
export interface Polylines {
  points: Float32Array
  /** Index of each polyline's first point, plus the total count at the end. */
  starts: number[]
}

/** Globe drawn with Canvas 2D over the CSS ocean: sunlit green land under white dots, coastlines and a latitude/longitude grid. */
export function createGlobeRenderer(canvas: HTMLCanvasElement, url: string): GlobeRenderer | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const grid = polylines(graticule())
  const cities = toSphere(globeCities.flatMap((c) => [c.lon * 10, c.lat * 10]))
  let dots: Float32Array = new Float32Array()
  let coast: Polylines = { points: new Float32Array(), starts: [0] }
  let land: Polylines = { points: new Float32Array(), starts: [0] }
  /** Projected points of one land ring: x, y and depth, reused ring after ring. */
  let ring = new Float32Array()
  let drawn = ''
  const planes = createFlyers(PLANE_COUNT, PLANE_SPEEDS)
  const balloons = createFlyers(BALLOON_COUNT, BALLOON_SPEEDS)
  const planePath = new Path2D(PLANE_PATH)
  const balloonPath = new Path2D(BALLOON_PATH)
  // Figures are pre-rendered with their shadow and drawn per frame with drawImage: the per-frame
  // fill-with-shadow path ignored globalAlpha in some browsers, leaving the planes opaque.
  let sprites: { px: number; plane: HTMLCanvasElement; balloon: HTMLCanvasElement } | null = null
  const controller = new AbortController()

  const ready = (async () => {
    const response = await fetch(url, { signal: controller.signal }).catch((error: unknown) => {
      // Disposed before the geometry arrived: nothing will be drawn, so this is not an error.
      if (controller.signal.aborted) return null
      throw error
    })
    if (!response) return
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    const data: { dots: number[]; lines: number[][]; land: number[][] } = await response.json()
    dots = toSphere(data.dots)
    coast = polylines(data.lines)
    land = polylines(data.land)
    ring = new Float32Array(3 * Math.max(0, ...data.land.map((r) => r.length / 2)))
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

      ctx.fillStyle = LAND_STYLE
      ctx.fill(landPath(land, ring, r, project))

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
      // One projection per dot: each lands in the path of its opacity level, and every level is filled once.
      const levels = DOT_LEVELS.map(() => new Path2D())
      for (let i = 0; i < dots.length; i += 3) {
        project(dots, i, q)
        if (q.depth < DOT_LEVELS[0].depth || q.y >= visible + side) continue
        let level = DOT_LEVELS.length - 1
        while (q.depth < DOT_LEVELS[level].depth) level--
        levels[level].rect(q.x - side / 2, q.y - side / 2, side, side)
      }
      ctx.fillStyle = '#fff'
      DOT_LEVELS.forEach(({ alpha }, level) => {
        ctx.globalAlpha = alpha
        ctx.fill(levels[level])
      })

      // Capitals: a white ring under a blue dot; resorts: a smaller blue dot. Batched by opacity level.
      const rings = CITY_LEVELS.map(() => new Path2D())
      const capitals = CITY_LEVELS.map(() => new Path2D())
      const resorts = CITY_LEVELS.map(() => new Path2D())
      for (let i = 0; i < globeCities.length; i++) {
        project(cities, i * 3, q)
        if (q.depth < CITY_LEVELS[0].depth || q.y >= visible + CAPITAL_RADIUS * pixelRatio * 2) continue
        let level = CITY_LEVELS.length - 1
        while (q.depth < CITY_LEVELS[level].depth) level--
        if (globeCities[i].kind === 'capital') {
          const rad = CAPITAL_RADIUS * pixelRatio
          rings[level].moveTo(q.x + rad + CAPITAL_RING * pixelRatio, q.y)
          rings[level].arc(q.x, q.y, rad + CAPITAL_RING * pixelRatio, 0, TAU)
          capitals[level].moveTo(q.x + rad, q.y)
          capitals[level].arc(q.x, q.y, rad, 0, TAU)
        } else {
          const rad = RESORT_RADIUS * pixelRatio
          resorts[level].moveTo(q.x + rad, q.y)
          resorts[level].arc(q.x, q.y, rad, 0, TAU)
        }
      }
      CITY_LEVELS.forEach(({ alpha }, level) => {
        ctx.globalAlpha = alpha
        ctx.fillStyle = '#fff'
        ctx.fill(rings[level])
        ctx.fillStyle = CITY_STYLE
        ctx.fill(capitals[level])
        ctx.fill(resorts[level])
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

      if (sprites?.px !== px)
        sprites = {
          px,
          plane: sprite(planePath, 24, 24, (PLANE_SIZE * px) / 24, pixelRatio),
          balloon: sprite(balloonPath, 24, 28, (BALLOON_SIZE * px) / 28, pixelRatio),
        }
      const { plane: planeSprite, balloon: balloonSprite } = sprites

      // Balloons first: the planes fly above them. They stay upright whatever their course.
      for (const balloon of balloons) {
        const alpha = place(balloon, BALLOON_SIZE * px)
        if (!alpha) continue
        ctx.globalAlpha = alpha
        ctx.drawImage(balloonSprite, q.x - balloonSprite.width / 2, q.y - balloonSprite.height / 2)
      }

      const head = { x: 0, y: 0, depth: 0 }
      const tail = { x: 0, y: 0, depth: 0 }
      ctx.lineCap = 'round'
      ctx.lineWidth = 1.5 * pixelRatio
      for (const plane of planes) {
        const alpha = place(plane, PLANE_SIZE * px)
        if (!alpha) continue
        ctx.globalAlpha = alpha

        // The contrail starts behind the tail: overlapping the body, two translucent whites would add up
        // to an opaque plane that never fades. Half the plane's length, in radians of arc.
        const tailStart = -PLANE_SIZE
        projectVec(ahead(plane, tailStart), head)
        projectVec(ahead(plane, -TRAIL_ANGLE), tail)
        const trail = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y)
        trail.addColorStop(0, 'rgba(255, 255, 255, 0.6)')
        trail.addColorStop(1, 'rgba(255, 255, 255, 0)')
        ctx.beginPath()
        ctx.moveTo(head.x, head.y)
        for (let k = 1; k <= 6; k++) {
          projectVec(ahead(plane, tailStart + ((tailStart + TRAIL_ANGLE) * -k) / 6), tail)
          // Past the horizon the contrail would fold back onto the visible disc.
          if (tail.depth < FADE_FROM) break
          ctx.lineTo(tail.x, tail.y)
        }
        ctx.strokeStyle = trail
        ctx.stroke()

        projectVec(ahead(plane, 0.01), head)
        const angle = Math.atan2(head.y - q.y, head.x - q.x) + Math.PI / 2
        ctx.setTransform(1, 0, 0, 1, q.x, q.y)
        ctx.rotate(angle)
        ctx.drawImage(planeSprite, -planeSprite.width / 2, -planeSprite.height / 2)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
      }
      ctx.globalAlpha = 1
      return true
    },
    describe() {
      const vertices = coast.starts.at(-1)! + grid.starts.at(-1)!
      return {
        geometry: `${dots.length / 3} dots · ${vertices} line vertices · ${land.starts.at(-1)!} land vertices`,
        canvas: `${canvas.width}×${canvas.height}`,
      }
    },
    dispose() {
      controller.abort()
    },
  } satisfies GlobeRenderer
}

export type Project = (p: Float32Array, i: number, out: { x: number; y: number; depth: number }) => void

/**
 * The visible part of the land as one path, filled with the non-zero rule. The land is on the left of every ring,
 * so a ring cut by the horizon is closed along the limb counter-clockwise on screen, from where it leaves the
 * visible hemisphere to the next point where any ring comes back: the Weiler–Atherton clip against a circle.
 */
export function landPath(land: Polylines, ring: Float32Array, r: number, project: Project): Path2D {
  const path = new Path2D()
  /** Visible stretches of the cut rings, as x, y pairs from the point of entry to the point of exit on the limb. */
  const runs: { enter: number; exit: number; points: number[] }[] = []
  const q = { x: 0, y: 0, depth: 0 }
  /** Where the edge from point a to point b of `ring` crosses the horizon, on the limb. */
  const horizon = (a: number, b: number, points: number[]) => {
    const t = ring[a + 2] / (ring[a + 2] - ring[b + 2])
    const dx = ring[a] - r + t * (ring[b] - ring[a])
    const dy = ring[a + 1] - r + t * (ring[b + 1] - ring[a + 1])
    const angle = Math.atan2(dy, dx)
    points.push(r + r * Math.cos(angle), r + r * Math.sin(angle))
    return angle
  }

  for (let l = 0; l + 1 < land.starts.length; l++) {
    const n = land.starts[l + 1] - land.starts[l]
    let hidden = -1
    for (let k = 0; k < n; k++) {
      project(land.points, (land.starts[l] + k) * 3, q)
      ring[k * 3] = q.x
      ring[k * 3 + 1] = q.y
      ring[k * 3 + 2] = q.depth
      if (q.depth <= 0) hidden = k
    }
    if (hidden < 0) {
      path.moveTo(ring[0], ring[1])
      for (let k = 1; k < n; k++) path.lineTo(ring[k * 3], ring[k * 3 + 1])
      path.closePath()
      continue
    }
    // Walk the ring once, starting just after a hidden point, so every run is whole.
    let run: (typeof runs)[number] | null = null
    for (let step = 1; step <= n; step++) {
      const prev = ((hidden + step - 1) % n) * 3
      const cur = ((hidden + step) % n) * 3
      if (ring[cur + 2] > 0) {
        if (!run) {
          run = { enter: 0, exit: 0, points: [] }
          run.enter = horizon(prev, cur, run.points)
        }
        run.points.push(ring[cur], ring[cur + 1])
      } else if (run) {
        run.exit = horizon(prev, cur, run.points)
        runs.push(run)
        run = null
      }
    }
  }

  const done = new Set<number>()
  for (let first = 0; first < runs.length; first++) {
    if (done.has(first)) continue
    let i = first
    path.moveTo(runs[i].points[0], runs[i].points[1])
    while (!done.has(i)) {
      done.add(i)
      const { points, exit } = runs[i]
      for (let k = 2; k < points.length; k += 2) path.lineTo(points[k], points[k + 1])
      // Counter-clockwise on screen is towards smaller canvas angles: the next entry is the nearest one that way.
      let next = i
      let gap = Infinity
      runs.forEach(({ enter }, j) => {
        const g = (((exit - enter) % TAU) + TAU) % TAU
        if (g < gap) [next, gap] = [j, g]
      })
      path.arc(r, r, r, exit, runs[next].enter, true)
      i = next
    }
    path.closePath()
  }
  return path
}

const TAU = 2 * Math.PI

/** A white figure drawn on a `w`×`h` grid at `scale`, with its soft shadow, centred in its own canvas. */
function sprite(path: Path2D, w: number, h: number, scale: number, pixelRatio: number): HTMLCanvasElement {
  const blur = 3 * pixelRatio
  const pad = Math.ceil(blur * 2)
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(w * scale) + 2 * pad
  canvas.height = Math.ceil(h * scale) + 2 * pad
  const ctx = canvas.getContext('2d')!
  ctx.translate(pad, pad)
  ctx.scale(scale, scale)
  ctx.shadowColor = FLYER_SHADOW
  ctx.shadowBlur = blur
  ctx.shadowOffsetY = pixelRatio
  ctx.fillStyle = FLYER_COLOR
  ctx.fill(path)
  return canvas
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

export function polylines(lines: number[][]): Polylines {
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
