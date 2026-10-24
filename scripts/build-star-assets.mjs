// Builds the pictures of the star search from the owner's sources (kept outside the repository):
//   node scripts/build-star-assets.mjs <dir with orb.png, modal-bg.jpeg, button.jpeg>
// Writes public/images/stars/{orb,orb-plain,modal-bg,modal-bg-mobile,button}.webp.
import { stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const src = process.argv[2]
if (!src) {
  console.error('Usage: node scripts/build-star-assets.mjs <sources dir>')
  process.exit(1)
}
const OUT = path.join(import.meta.dirname, '..', 'public', 'images', 'stars')
const MAX_KB = 200

async function save(image, name) {
  const file = path.join(OUT, name)
  const { width, height } = await image.toFile(file)
  const kb = Math.round((await stat(file)).size / 1024)
  console.log(`${name}: ${width}x${height}, ${kb} KB`)
  if (kb >= MAX_KB) throw new Error(`${name} is ${kb} KB, the limit is ${MAX_KB} KB`)
}

// The orbs on the 1254 px sources: centre and radius of the glass sphere. orb.png has its alpha; the plain one
// (no star in the middle, under the sign of the zodiac) lies on black.
const ORBS = [
  { file: 'orb.png', name: 'orb.webp', center: [626.7, 626.7], radius: 549 },
  { file: 'orb-plain.jpeg', name: 'orb-plain.webp', center: [631, 624], radius: 563, black: 30 },
]
// In the WebP the sphere is centred with a radius of 256 px of 640: MagicOrb and the video draw the
// picture at 125% of the sphere's box, the rest is room for the golden orbit and the glow.
const ORB_SIZE = 640
const ORB_OUT_RADIUS = 256

/**
 * Turns the black around the sphere into transparency: inside the sphere alpha is 1, so its dark places stay;
 * outside it comes from the brightness, so the orbits, sparks and glow stay, the colour divided by alpha.
 */
async function keyBlack(file, [cx, cy], radius, black) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const out = Buffer.alloc(info.width * info.height * 4)
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = y * info.width + x
      const [r, g, b] = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]]
      const inside = Math.min(1, Math.max(0, (radius - Math.hypot(x - cx, y - cy)) / 4 + 0.5))
      const bright = Math.min(1, Math.max(0, (Math.max(r, g, b) - black) / (255 - black)))
      const alpha = Math.max(inside, Math.min(1, bright * 1.6) ** 0.8)
      const k = inside >= 1 ? 1 : alpha > 0 ? 1 / alpha : 0
      out[i * 4] = Math.min(255, r * k)
      out[i * 4 + 1] = Math.min(255, g * k)
      out[i * 4 + 2] = Math.min(255, b * k)
      out[i * 4 + 3] = Math.round(alpha * 255)
    }
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer()
}

async function buildOrb({ file, name, center, radius, black }) {
  const input = black === undefined ? path.join(src, file) : await keyBlack(path.join(src, file), center, radius, black)
  const { width } = await sharp(input).metadata()
  const scale = ORB_OUT_RADIUS / radius
  const size = Math.round(width * scale)
  const [left, top] = center.map((c) => Math.round(ORB_SIZE / 2 - c * scale))
  const orb = await sharp(input).resize(size, size).png().toBuffer()
  await save(
    sharp({ create: { width: ORB_SIZE, height: ORB_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: orb, left, top }])
      .webp({ quality: 72, alphaQuality: 90, effort: 6 }),
    name,
  )
}

async function buildBackground() {
  const bg = sharp(path.join(src, 'modal-bg.jpeg'))
  await save(bg.clone().webp({ quality: 68, effort: 6 }), 'modal-bg.webp')
  await save(bg.clone().resize({ width: 640 }).webp({ quality: 68, effort: 6 }), 'modal-bg-mobile.webp')
}

// The pill of button.jpeg on the 2000x667 source: crop with its glow, and the inside of the rim.
const BUTTON_CROP = { left: 0, top: 95, width: 2000, height: 465 }
const PILL = { left: 30, top: 135, right: 1970, bottom: 520, radius: 190 }
const BUTTON_WIDTH = 960
/** Brightness of the black at which the glow is opaque. */
const GLOW_FULL = 64

/** Signed distance from a point to the rounded rectangle of the pill: negative inside. */
function pillDistance(x, y) {
  const { left, top, right, bottom, radius } = PILL
  const cx = Math.max(left + radius, Math.min(right - radius, x))
  const cy = Math.max(top + radius, Math.min(bottom - radius, y))
  return Math.hypot(x - cx, y - cy) - radius
}

/**
 * Turns the black around the pill into transparency: inside the rim alpha is 1; outside it comes from the
 * brightness, so the glow stays and the black goes, and the colour is divided by alpha (no dark fringe).
 */
async function buildButton() {
  const { data, info } = await sharp(path.join(src, 'button.jpeg'))
    .extract(BUTTON_CROP)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const out = Buffer.alloc(info.width * info.height * 4)
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = y * info.width + x
      const [r, g, b] = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]]
      const inside = Math.min(1, Math.max(0, 0.5 - pillDistance(x, y + BUTTON_CROP.top) / 4))
      const alpha = Math.max(inside, Math.min(1, Math.max(r, g, b) / GLOW_FULL))
      const k = alpha > 0 ? 1 / alpha : 0
      out[i * 4] = Math.min(255, r * k)
      out[i * 4 + 1] = Math.min(255, g * k)
      out[i * 4 + 2] = Math.min(255, b * k)
      out[i * 4 + 3] = Math.round(alpha * 255)
    }
  }
  await save(
    sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
      .resize({ width: BUTTON_WIDTH })
      .webp({ quality: 74, alphaQuality: 90, effort: 6 }),
    'button.webp',
  )
}

await Promise.all([...ORBS.map(buildOrb), buildBackground(), buildButton()])
