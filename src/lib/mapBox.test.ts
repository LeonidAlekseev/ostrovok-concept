import { describe, expect, it } from 'vitest'
import { boxAround, boxParam, inBox, MAX_BOX_SPAN_DEG, parseBox } from './mapBox'

// hotel-page, Requirement: Отель на карте
describe('boxAround', () => {
  it('grows the view by half its size on each side and snaps it outward to the grid', () => {
    const box = boxAround([-0.38, 39.465, -0.37, 39.47])
    expect(box).toEqual([-0.385, 39.46, -0.365, 39.475])
    expect(parseBox(boxParam(box))).toEqual(box)
  })

  it('keeps a far view to the widest box around its middle', () => {
    const [west, south, east, north] = boxAround([-1, 39, 0.4, 40])
    expect(east - west).toBeLessThanOrEqual(MAX_BOX_SPAN_DEG + 1e-9)
    expect(north - south).toBeLessThanOrEqual(MAX_BOX_SPAN_DEG + 1e-9)
    expect(inBox([west, south, east, north], -0.3, 39.5)).toBe(true)
  })

  it('gives the same box for a small move', () => {
    expect(boxAround([-0.378, 39.463, -0.368, 39.468])).toEqual(boxAround([-0.3775, 39.4635, -0.3675, 39.4685]))
  })
})

describe('parseBox', () => {
  it.each([
    ['three numbers', '-0.4,39.4,-0.3'],
    ['words', 'a,b,c,d'],
    ['west after east', '-0.3,39.4,-0.4,39.5'],
    ['too wide', '-0.5,39.4,-0.3,39.45'],
    ['out of range', '179.99,95,180,96'],
  ])('rejects %s', (_, value) => {
    expect(parseBox(value)).toBeNull()
  })
})
