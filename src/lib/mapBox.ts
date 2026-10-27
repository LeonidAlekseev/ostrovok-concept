/**
 * The box of the map's neighbours: the hotels of a map around one hotel are loaded for the part of the city in view and
 * a margin around it (`GET /api/hotels?bbox=`), never the whole city at once.
 */

/** West, south, east, north, degrees. */
export type MapBox = readonly [west: number, south: number, east: number, north: number]

/** The widest box a request, degrees (~11 km north to south): a far zoom loads the middle of the view. */
export const MAX_BOX_SPAN_DEG = 0.1

/** The edges of a box snap outward to this grid, degrees, so a small move asks for the box already loaded. */
const GRID_DEG = 0.005

/** The view grows by this share of its size on each side: the neighbours just outside are already there. */
const MARGIN = 0.5

const snapDown = (value: number) => Math.floor(value / GRID_DEG) * GRID_DEG
const snapUp = (value: number) => Math.ceil(value / GRID_DEG) * GRID_DEG
const fixed = (value: number) => Number(value.toFixed(3))

/** One side of the box: the view's side with its margin, no wider than `MAX_BOX_SPAN_DEG` around its middle, snapped. */
function side(low: number, high: number, min: number, max: number): [number, number] {
  const middle = (low + high) / 2
  const half = Math.min(((high - low) * (1 + 2 * MARGIN)) / 2, (MAX_BOX_SPAN_DEG - 2 * GRID_DEG) / 2)
  return [fixed(Math.max(min, snapDown(middle - half))), fixed(Math.min(max, snapUp(middle + half)))]
}

/** The box to load for a view of the map: the view with its margin, at most `MAX_BOX_SPAN_DEG` a side, on the grid. */
export function boxAround(view: MapBox): MapBox {
  const [west, east] = side(view[0], view[2], -180, 180)
  const [south, north] = side(view[1], view[3], -90, 90)
  return [west, south, east, north]
}

/** A degree of `?bbox=`: up to 3 digits and 6 decimals. */
const DEGREE = String.raw`-?\d{1,3}(\.\d{1,6})?`

/** The shape of `?bbox=`: four degrees with commas; `parseBox` checks their order and the box's size. */
export const BBOX_PATTERN = new RegExp(`^${DEGREE}(,${DEGREE}){3}$`)

/** `west,south,east,north` of `?bbox=`, or `null` for anything else: not four numbers, out of order or too wide. */
export function parseBox(value: string): MapBox | null {
  if (!BBOX_PATTERN.test(value)) return null
  const [west, south, east, north] = value.split(',').map(Number)
  const valid =
    west >= -180 &&
    east <= 180 &&
    south >= -90 &&
    north <= 90 &&
    west < east &&
    south < north &&
    east - west <= MAX_BOX_SPAN_DEG + 1e-9 &&
    north - south <= MAX_BOX_SPAN_DEG + 1e-9
  return valid ? [west, south, east, north] : null
}

export const boxParam = (box: MapBox) => box.join(',')

/** Whether the point lies in the box. */
export const inBox = (box: MapBox, lon: number, lat: number) =>
  lon >= box[0] && lon <= box[2] && lat >= box[1] && lat <= box[3]
