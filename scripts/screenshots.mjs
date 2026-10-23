#!/usr/bin/env node
// Screenshots of pages in two viewports, with a pixel comparison against an earlier run.
// Usage: node scripts/screenshots.mjs [options] <path>...   (see README, «Визуальная проверка»)
import { chromium } from 'playwright-core'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const { values, positionals: paths } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: 'string', default: 'http://localhost:3341' },
    name: { type: 'string', default: 'ostrovok' },
    out: { type: 'string' },
    label: { type: 'string', default: 'current' },
    against: { type: 'string' },
    wait: { type: 'string', default: '1000' },
    mask: { type: 'string', multiple: true, default: [] },
  },
})

const VIEWPORTS = { mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } }
const THRESHOLD = 0.1
// Images stay out of the repository: the default output lives in /tmp.
const out = values.out ?? `/tmp/${values.name}-screenshots`
if (paths.length === 0) paths.push('/')

const slug = (path) => path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'
const dir = (label) => join(out, label)
mkdirSync(dir(values.label), { recursive: true })

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const files = []
try {
  for (const [viewport, size] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({ viewport: size, reducedMotion: 'reduce' })
    const page = await context.newPage()
    for (const path of paths) {
      await page.goto(new URL(path, values.base).href, { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(Number(values.wait))
      const file = `${slug(path)}-${viewport}.png`
      await page.screenshot({
        path: join(dir(values.label), file),
        fullPage: true,
        animations: 'disabled',
        mask: values.mask.map((selector) => page.locator(selector)),
      })
      files.push(file)
    }
    await context.close()
  }
} finally {
  await browser.close()
}

let different = false
for (const file of files) {
  if (!values.against) {
    console.log(`${file}: saved`)
    continue
  }
  const basePath = join(dir(values.against), file)
  if (!existsSync(basePath)) {
    console.log(`${file}: no baseline in ${dir(values.against)}`)
    different = true
    continue
  }
  const a = PNG.sync.read(readFileSync(basePath))
  const b = PNG.sync.read(readFileSync(join(dir(values.label), file)))
  if (a.width !== b.width || a.height !== b.height) {
    console.log(`${file}: size ${a.width}x${a.height} -> ${b.width}x${b.height}`)
    different = true
    continue
  }
  const diff = new PNG({ width: a.width, height: a.height })
  const count = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: THRESHOLD })
  const percent = (count / (a.width * a.height)) * 100
  if (count > 0) {
    different = true
    writeFileSync(join(dir(values.label), file.replace('.png', '.diff.png')), PNG.sync.write(diff))
  }
  console.log(`${file}: ${percent.toFixed(3)} % differ`)
}
console.log(`output: ${dir(values.label)}`)
process.exitCode = different ? 1 : 0
