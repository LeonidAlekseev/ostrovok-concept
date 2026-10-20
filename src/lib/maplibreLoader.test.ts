import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const loader = require('../../config/maplibre-no-asset-glob.cjs') as (source: string) => string
const library = readFileSync(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'), 'utf8')

// The loader exists because Turbopack globs `new URL(x, import.meta.url)` into assets; see next.config.ts.
describe('config/maplibre-no-asset-glob.cjs', () => {
  it('still has something to replace in the installed maplibre-gl.mjs', () => {
    expect(library).toMatch(/new URL\([^()]*,\s*import\.meta\.url\)/)
  })

  it('leaves no import.meta.url in maplibre-gl.mjs', () => {
    expect(loader(library)).not.toContain('import.meta.url')
  })
})
