import { describe, expect, it } from 'vitest'
import { MERGED_OTA_HOTELS, mergedHotelRedirects, withoutMergedHotels } from './merged'

describe('merged Ostrovok hotels', () => {
  it('folds the Reina 107 duplicate into the hotel with the page', () => {
    expect(MERGED_OTA_HOTELS).toEqual({ 9783413: 9559092 })
  })

  it('drops the duplicate from a list and keeps the order of the rest', () => {
    const rows = [{ master_id: 1 }, { master_id: 9783413 }, { master_id: 9559092 }]
    expect(withoutMergedHotels(rows, (row) => row.master_id)).toEqual([{ master_id: 1 }, { master_id: 9559092 }])
  })

  it('redirects the old link permanently', () => {
    expect(mergedHotelRedirects()).toEqual([
      { source: '/hotels/ota-9783413', destination: '/hotels/ota-9559092', permanent: true },
    ])
  })

  it('never redirects to a hotel that is itself folded', () => {
    for (const to of Object.values(MERGED_OTA_HOTELS)) expect(to in MERGED_OTA_HOTELS).toBe(false)
  })
})

describe('next.config redirects', () => {
  it('serves the permanent redirect of the folded duplicate', async () => {
    const { default: config } = await import('../../../next.config')
    expect(await config.redirects?.()).toContainEqual({
      source: '/hotels/ota-9783413',
      destination: '/hotels/ota-9559092',
      permanent: true,
    })
  })
})
