#!/usr/bin/env node
// The photos of the assistant's starter cards ("На море", "В горы", "Города"): the top of each card of the owner's
// mockup, above its label plaque and inside its rounded corners, to WebP in public/assistant/chips. The mockup
// stays out of the repository.
// Usage: node scripts/build-assistant-chips.mjs <path to assistant-chat-mockup.jpg>
import sharp from 'sharp'
import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const [source] = process.argv.slice(2)
if (!source) {
  console.error('Usage: node scripts/build-assistant-chips.mjs <mockup.jpg>')
  process.exit(1)
}
const out = 'public/assistant/chips'
mkdirSync(out, { recursive: true })

/** The photo areas in the 1290×964 mockup. */
const CROPS = {
  sea: { left: 128, top: 532, width: 310, height: 70 },
  mountains: { left: 515, top: 532, width: 295, height: 70 },
  cities: { left: 888, top: 532, width: 285, height: 70 },
}
/** Each photo stays under this size. */
const MAX_BYTES = 40 * 1024

for (const [name, area] of Object.entries(CROPS)) {
  const file = join(out, `${name}.webp`)
  await sharp(source).extract(area).webp({ quality: 85 }).toFile(file)
  const { size } = statSync(file)
  if (size > MAX_BYTES) throw new Error(`${file}: ${size} bytes, over ${MAX_BYTES}`)
  console.log(`${file}: ${area.width}×${area.height}, ${(size / 1024).toFixed(1)} KB`)
}
