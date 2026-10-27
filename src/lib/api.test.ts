import { describe, expect, it, vi } from 'vitest'
import { apiError, CDN_CACHE_HEADERS, loadVisibleHotel } from './api'

vi.mock('@/lib/db/catalog', () => import('@/test/catalog'))
vi.mock('@/lib/env', () => import('@/test/env'))

describe('apiError', () => {
  it('answers { error } with the status', async () => {
    const response = apiError(503, 'Catalog unavailable')
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Catalog unavailable' })
  })
})

describe('CDN_CACHE_HEADERS', () => {
  it('lets the CDN keep a public answer a short while', () => {
    expect(CDN_CACHE_HEADERS['Cache-Control']).toMatch(/^public, s-maxage=\d+, stale-while-revalidate=\d+$/)
  })
})

describe('loadVisibleHotel', () => {
  it('finds a hotel shown here and nothing for an unknown id', async () => {
    expect((await loadVisibleHotel('prague-old-town-lantern'))?.id).toBe('prague-old-town-lantern')
    expect(await loadVisibleHotel('nowhere-hotel')).toBeUndefined()
  })
})
