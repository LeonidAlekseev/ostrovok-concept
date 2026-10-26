import { describe, expect, it } from 'vitest'
import { storageBucket } from '@/test/storageBucket'
import {
  ORPHAN_AGE_MS,
  orphanSharedPhotos,
  removeSharedPhotos,
  sharePhotoPaths,
  sharedPhotoOwners,
} from './sharedPhotos'

const now = Date.parse('2026-10-26T12:00:00.000Z')
const old = new Date(now - ORPHAN_AGE_MS - 1).toISOString()
const fresh = new Date(now - 60_000).toISOString()

// assistant-search, Requirement: Лимит фото (Scenario: Удаление снимка)
describe('the photos of the deleted snapshots', () => {
  const bucket = () =>
    storageBucket({
      'u1/kept/0.webp': old,
      'u1/gone/0.webp': old,
      'u1/gone/1.jpg': old,
      'u1/sharing/0.webp': fresh,
      'u2/other/0.webp': old,
    })

  it('are the old folders of the user with no snapshot', async () => {
    const b = bucket()
    expect(await orphanSharedPhotos(b as never, 'u1', new Set(['kept']), now)).toEqual([
      'u1/gone/0.webp',
      'u1/gone/1.jpg',
    ])
    expect(await sharedPhotoOwners(b as never)).toEqual(['u1', 'u2'])
    expect(await sharePhotoPaths(b as never, 'u1/kept')).toEqual(['u1/kept/0.webp'])
  })

  it('are removed', async () => {
    const b = bucket()
    expect(await removeSharedPhotos(b as never, ['u1/gone/0.webp', 'u1/gone/1.jpg', 'u1/none.webp'])).toBe(2)
    expect([...b.stored.keys()]).toEqual(['u1/kept/0.webp', 'u1/sharing/0.webp', 'u2/other/0.webp'])
  })

  it('are listed past a page', async () => {
    const b = storageBucket(Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`u1/gone/${i}.webp`, old])))
    expect(await orphanSharedPhotos(b as never, 'u1', new Set(), now)).toHaveLength(1001)
  })
})
