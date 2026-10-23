import { useEffect, useRef, type PointerEvent } from 'react'
import { BRUSH_WIDTH, CANVAS_HEIGHT, CANVAS_WIDTH, PALETTE, type Point, type Stroke } from '../../lib/drawMood'

const HEX = new Map(PALETTE.map((color) => [color.id, color.hex]))

/** The point under the pointer in canvas units; the bounding box, as the client coordinates are on screen. */
const pointOf = (canvas: HTMLCanvasElement, { clientX, clientY }: { clientX: number; clientY: number }): Point => {
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
  }
}

function drawStroke(ctx: CanvasRenderingContext2D, { colorId, width, points }: Stroke) {
  ctx.strokeStyle = HEX.get(colorId) ?? '#000'
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  // A single point is a zero-length line: the round caps paint it as a dot.
  for (const { x, y } of points.length > 1 ? points.slice(1) : points) ctx.lineTo(x, y)
  ctx.stroke()
}

/**
 * Sizes the backing store to the canvas on screen times the device pixel ratio and maps the logical
 * `CANVAS_WIDTH`×`CANVAS_HEIGHT` onto it; the client size, not the bounding box, so the window's zoom-in
 * animation does not shrink it.
 */
function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const dpr = window.devicePixelRatio || 1
  const width = Math.round(canvas.clientWidth * dpr)
  const height = Math.round(canvas.clientHeight * dpr)
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  ctx.setTransform(width / CANVAS_WIDTH, 0, 0, height / CANVAS_HEIGHT, 0, 0)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  return ctx
}

interface Props {
  strokes: readonly Stroke[]
  colorId: string
  /** A stroke is done: the pointer went up. */
  onStroke: (stroke: Stroke) => void
}

/**
 * The canvas: a mouse, a finger or a stylus paints with the chosen colour (Pointer Events); `touch-none`
 * keeps the page from scrolling under the finger. The stroke under way is painted as it goes and handed over
 * when the pointer goes up; then the whole drawing is painted again from the strokes.
 */
export function DrawCanvas({ strokes, colorId, onStroke }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const current = useRef<Stroke | null>(null)

  useEffect(() => {
    const canvas = ref.current!
    const paint = () => {
      const ctx = context(canvas)
      if (!ctx) return
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      for (const stroke of strokes) drawStroke(ctx, stroke)
      if (current.current) drawStroke(ctx, current.current)
    }
    paint()
    // A new size or pixel ratio clears the backing store.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(paint)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [strokes])

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    current.current = { colorId, width: BRUSH_WIDTH, points: [pointOf(event.currentTarget, event)] }
    const ctx = context(event.currentTarget)
    if (ctx) drawStroke(ctx, current.current)
  }

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const stroke = current.current
    if (!stroke) return
    const ctx = context(event.currentTarget)
    // The coalesced events keep a fast line smooth.
    const events = event.nativeEvent.getCoalescedEvents?.() ?? []
    for (const native of events.length ? events : [event.nativeEvent]) {
      const last = stroke.points[stroke.points.length - 1]
      const point = pointOf(event.currentTarget, native)
      stroke.points.push(point)
      if (ctx) drawStroke(ctx, { ...stroke, points: [last, point] })
    }
  }

  const end = () => {
    const stroke = current.current
    current.current = null
    if (stroke) onStroke(stroke)
  }

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={strokes.length ? `Рисунок: мазков — ${strokes.length}` : 'Пустой холст'}
      className="aspect-[3/2] w-full cursor-crosshair touch-none rounded-[clamp(18px,4vw,28px)] bg-white shadow-(--shadow-card) ring-1 ring-foreground/5"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    />
  )
}
