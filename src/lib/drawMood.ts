import { VIBE_AXES, type Answer } from './vibe'

/**
 * The drawing search: every colour of the palette is a mood that pulls some axes of the vibe to a side. The
 * shares of the colours in the drawing weigh the pulls; an axis pulled less than `NEUTRAL` stays «Не могу
 * выбрать». The drawing is measured by its strokes, not by its pixels, so the reading is a pure function.
 */

/** The logical size of the canvas: strokes are in these units whatever the size on screen. */
export const CANVAS_WIDTH = 600
export const CANVAS_HEIGHT = 400
/** Width of the brush, in canvas units. */
export const BRUSH_WIDTH = 14

/** The axis ids of `VIBE_AXES`. */
type AxisId = 'evening' | 'place' | 'size' | 'leisure' | 'food' | 'budget' | 'location'

export interface PaintColor {
  id: string
  /** The paint itself: the canvas needs a colour, not a class. */
  hex: string
  /** The mood of the colour, under its swatch. */
  label: string
  /** The side each axis is pulled to; the axes not named stay as they are. */
  pull: Partial<Record<AxisId, -1 | 1>>
}

export const PALETTE: readonly PaintColor[] = [
  { id: 'blue', hex: '#1c7ed6', label: 'Море и покой', pull: { place: -1, evening: -1 } },
  { id: 'turquoise', hex: '#15aabf', label: 'Спа и вода', pull: { leisure: -1 } },
  { id: 'green', hex: '#37b24d', label: 'Природа и тишина', pull: { location: -1, size: -1 } },
  { id: 'yellow', hex: '#fcc419', label: 'Солнце и веселье', pull: { evening: 1 } },
  { id: 'orange', hex: '#fd7e14', label: 'Приключения', pull: { leisure: 1, food: 1 } },
  { id: 'red', hex: '#e03131', label: 'Страсть и ужины', pull: { food: 1, evening: 1 } },
  { id: 'violet', hex: '#7048e8', label: 'Ночь и город', pull: { place: 1, leisure: 1 } },
  { id: 'gold', hex: '#d4a017', label: 'Роскошь', pull: { budget: 1, size: 1 } },
  { id: 'gray', hex: '#868e96', label: 'Мегаполис', pull: { place: 1, location: 1 } },
  { id: 'brown', hex: '#8b5a2b', label: 'Уют и экономия', pull: { budget: -1, size: -1 } },
]

export interface Point {
  x: number
  y: number
}

export interface Stroke {
  colorId: string
  width: number
  points: Point[]
}

/** An axis pulled less than this, in shares of the drawing, is neutral. */
export const NEUTRAL = 0.15
/** «Показать путешествие» waits for this share of the canvas to be painted. */
export const MIN_PAINTED = 0.03

/** The painted area of a stroke: its length times its width, plus a width for the round caps, so a dot counts. */
export function strokeArea({ points, width }: Stroke): number {
  let length = 0
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  return points.length ? (length + width) * width : 0
}

/** The share of the canvas the strokes cover, overlaps counted twice; at most 1. */
export const paintedShare = (strokes: readonly Stroke[]) =>
  Math.min(1, strokes.reduce((sum, stroke) => sum + strokeArea(stroke), 0) / (CANVAS_WIDTH * CANVAS_HEIGHT))

export interface ColorShare {
  color: PaintColor
  /** Share of the drawing, 0..1. */
  share: number
}

/** The colours of the drawing by their share, the largest first; the colours not used are left out. */
export function colorShares(strokes: readonly Stroke[]): ColorShare[] {
  const areas = new Map<string, number>()
  for (const stroke of strokes) areas.set(stroke.colorId, (areas.get(stroke.colorId) ?? 0) + strokeArea(stroke))
  const total = [...areas.values()].reduce((sum, area) => sum + area, 0)
  if (!total) return []
  return PALETTE.flatMap((color) => {
    const area = areas.get(color.id)
    return area ? [{ color, share: area / total }] : []
  }).sort((a, b) => b.share - a.share)
}

/** The answers of the drawing on every axis of the vibe: the side its colours pull to, 0 below `NEUTRAL`. */
export function drawAnswers(strokes: readonly Stroke[]): Answer[] {
  const shares = colorShares(strokes)
  return VIBE_AXES.map((axis) => {
    const pull = shares.reduce((sum, { color, share }) => sum + share * (color.pull[axis.id as AxisId] ?? 0), 0)
    return Math.abs(pull) < NEUTRAL ? 0 : pull < 0 ? -1 : 1
  })
}

/**
 * The stroke «Добавить мазок» paints without a pointer: a wave across the canvas, each next one lower, so one
 * stroke alone paints more than `MIN_PAINTED`.
 */
export function keyboardStroke(colorId: string, index: number): Stroke {
  const rows = 6
  const y0 = (CANVAS_HEIGHT / (rows + 1)) * ((index % rows) + 1)
  const points: Point[] = []
  for (let x = 30; x <= CANVAS_WIDTH - 30; x += 15)
    points.push({ x, y: y0 + Math.sin((x / CANVAS_WIDTH) * Math.PI * 4) * 18 })
  return { colorId, width: BRUSH_WIDTH * 1.5, points }
}
