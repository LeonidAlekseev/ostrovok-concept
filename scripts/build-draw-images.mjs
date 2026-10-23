#!/usr/bin/env node
// The pictures of the draw search: the section's background, the drawing of its preview and the picture of the
// ready route, from the owner's PNGs to WebP in public/images/draw. The PNGs stay out of the repository.
// Usage: node scripts/build-draw-images.mjs <dir with section-bg.png, canvas-drawing.png, result-image.png>
import sharp from 'sharp'
import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const [source] = process.argv.slice(2)
if (!source) {
  console.error('Usage: node scripts/build-draw-images.mjs <source dir>')
  process.exit(1)
}
const out = 'public/images/draw'
mkdirSync(out, { recursive: true })

/** Pixels at or above this alpha are the strokes; the speckles around them stay below it. */
const SOLID = 128
/** The soft edge kept around the strokes, in source pixels. */
const EDGE = 2

/**
 * The drawing with its alpha cleaned: the strokes (8-connected areas of solid alpha) and a soft edge of `EDGE`
 * pixels around them stay, every speckle further away goes. The edge pixels take the colour of the stroke under
 * them, so no dark fringe shows on a light card.
 */
async function cleanDrawing(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  const solid = new Uint8Array(W * H)
  for (let p = 0; p < W * H; p++) solid[p] = data[p * 4 + 3] >= SOLID ? 1 : 0

  const result = Buffer.alloc(data.length)
  for (let p = 0; p < W * H; p++) {
    const alpha = data[p * 4 + 3]
    if (!alpha) continue
    if (solid[p]) {
      data.copy(result, p * 4, p * 4, p * 4 + 4)
      continue
    }
    // A faint pixel: kept only next to a stroke, in the stroke's average colour.
    const x = p % W
    const y = (p - x) / W
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let dy = -EDGE; dy <= EDGE; dy++) {
      for (let dx = -EDGE; dx <= EDGE; dx++) {
        const X = x + dx
        const Y = y + dy
        if (X < 0 || Y < 0 || X >= W || Y >= H || !solid[Y * W + X]) continue
        const q = (Y * W + X) * 4
        r += data[q]
        g += data[q + 1]
        b += data[q + 2]
        n++
      }
    }
    if (!n) continue
    result[p * 4] = Math.round(r / n)
    result[p * 4 + 1] = Math.round(g / n)
    result[p * 4 + 2] = Math.round(b / n)
    result[p * 4 + 3] = alpha
  }
  return sharp(result, { raw: { width: W, height: H, channels: 4 } }).trim({
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
}

const jobs = [
  // The background: the whole picture for wide screens, a narrower copy for phones.
  ['bg.webp', () => sharp(join(source, 'section-bg.png')).resize({ width: 1127 }), { quality: 80 }],
  ['bg-mobile.webp', () => sharp(join(source, 'section-bg.png')).resize({ width: 760 }), { quality: 70 }],
  [
    'preview.webp',
    async () => (await cleanDrawing(join(source, 'canvas-drawing.png'))).resize({ width: 1100 }),
    {
      quality: 76,
      alphaQuality: 80,
    },
  ],
  ['result.webp', () => sharp(join(source, 'result-image.png')).resize({ width: 1200 }), { quality: 70 }],
  ['result-mobile.webp', () => sharp(join(source, 'result-image.png')).resize({ width: 720 }), { quality: 72 }],
]

for (const [name, build, options] of jobs) {
  const file = join(out, name)
  // Built in memory first: trim() needs the cleaned pixels before the resize.
  const image = sharp(await (await build()).png().toBuffer())
  const info = await image.webp({ effort: 6, smartSubsample: true, ...options }).toFile(file)
  console.log(`${file}: ${info.width}×${info.height}, ${Math.round(statSync(file).size / 1024)} KB`)
}
