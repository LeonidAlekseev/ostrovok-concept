import { describe, expect, it } from 'vitest'
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  colorShares,
  drawAnswers,
  keyboardStroke,
  MIN_PAINTED,
  PALETTE,
  paintedShare,
  strokeArea,
  type Stroke,
} from './drawMood'
import { VIBE_AXES, vibeArchetype } from './vibe'

/** A horizontal line of `length` canvas units. */
const line = (colorId: string, length: number, width = 10): Stroke => ({
  colorId,
  width,
  points: [
    { x: 0, y: 0 },
    { x: length, y: 0 },
  ],
})

/** The answer on the axis with this id. */
const on = (answers: readonly number[], axisId: string) => answers[VIBE_AXES.findIndex((a) => a.id === axisId)]

// draw-search, Requirement: Холст и палитра
describe('PALETTE', () => {
  it('has 8–10 colours, each with a mood and a pull on known axes', () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(8)
    expect(PALETTE.length).toBeLessThanOrEqual(10)
    const axes = new Set(VIBE_AXES.map((a) => a.id))
    for (const color of PALETTE) {
      expect(color.label).toBeTruthy()
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/)
      expect(Object.keys(color.pull).length).toBeGreaterThan(0)
      for (const axis of Object.keys(color.pull)) expect(axes.has(axis)).toBe(true)
    }
    expect(new Set(PALETTE.map((c) => c.id)).size).toBe(PALETTE.length)
  })
})

describe('strokeArea', () => {
  it('is the length times the width, with a width for the caps', () => {
    expect(strokeArea(line('blue', 100, 10))).toBe(1100)
    expect(strokeArea({ colorId: 'blue', width: 10, points: [{ x: 5, y: 5 }] })).toBe(100)
    expect(strokeArea({ colorId: 'blue', width: 10, points: [] })).toBe(0)
  })
})

// draw-search, Requirement: Настроение по цветам
describe('drawAnswers', () => {
  it('reads a blue drawing as «Море» and «Тихий вечер»', () => {
    const answers = drawAnswers([line('blue', 300), line('blue', 200)])
    expect(on(answers, 'place')).toBe(-1)
    expect(on(answers, 'evening')).toBe(-1)
    expect(answers.filter(Boolean)).toHaveLength(2)
    expect(vibeArchetype(answers).name).toBe('Тихая гавань')
  })

  it('weighs a mix by the shares: the larger colour wins an axis they disagree on', () => {
    // Blue pulls the evening down, red up; red is three times as much.
    const answers = drawAnswers([line('blue', 90), line('red', 290)])
    expect(on(answers, 'evening')).toBe(1)
    expect(on(answers, 'food')).toBe(1)
    // Blue's quarter alone still pulls the place to the sea.
    expect(on(answers, 'place')).toBe(-1)
  })

  it('leaves an axis pulled less than 0.15 neutral', () => {
    // Gold has a tenth of the drawing: budget and size are pulled by 0.1.
    const answers = drawAnswers([line('blue', 890), line('gold', 90)])
    expect(on(answers, 'budget')).toBe(0)
    expect(on(answers, 'size')).toBe(0)
    // At a fifth they turn.
    const more = drawAnswers([line('blue', 790), line('gold', 190)])
    expect(on(more, 'budget')).toBe(1)
    expect(on(more, 'size')).toBe(1)
  })

  it('cancels equal opposite pulls', () => {
    const answers = drawAnswers([line('gold', 100), line('brown', 100)])
    expect(on(answers, 'budget')).toBe(0)
    expect(on(answers, 'size')).toBe(0)
  })

  it('answers nothing for an empty drawing', () => {
    expect(drawAnswers([])).toEqual([0, 0, 0, 0, 0, 0, 0])
    expect(colorShares([])).toEqual([])
    expect(paintedShare([])).toBe(0)
  })
})

describe('colorShares', () => {
  it('gives each used colour its share, the largest first', () => {
    const shares = colorShares([line('green', 90), line('violet', 290), line('green', 90)])
    expect(shares.map((s) => s.color.id)).toEqual(['violet', 'green'])
    expect(shares[0].share).toBeCloseTo(0.6)
    expect(shares[1].share).toBeCloseTo(0.4)
  })
})

// draw-search, Requirement: Рисование с клавиатуры; Scenario: Пустой холст
describe('paintedShare', () => {
  it('a single keyboard stroke paints at least the minimum', () => {
    expect(paintedShare([keyboardStroke('green', 0)])).toBeGreaterThanOrEqual(MIN_PAINTED)
    expect(keyboardStroke('green', 0).colorId).toBe('green')
  })

  it('a short line stays below the minimum and the share caps at 1', () => {
    expect(paintedShare([line('blue', 50)])).toBeLessThan(MIN_PAINTED)
    expect(paintedShare([line('blue', CANVAS_WIDTH * CANVAS_HEIGHT, 10)])).toBe(1)
  })
})
