import { describe, expect, it, vi } from 'vitest'
import { loadHotel, loadHiddenHotelIds } from '@/lib/db/catalog'
import { loadHotelDetails } from '@/lib/db/hotelDetails'
import { loadHotelView } from '@/lib/db/view'
import { loadHotelNoise } from '@/lib/db/noise'

// The snapshot of data/standalone read by the site's own readers, outside Next's cache.
vi.mock('next/cache', () => ({ unstable_cache: (read: unknown) => read }))

const ID = 'ota-7481548'

describe('the snapshot', () => {
  it('has the real hotel, its page and the hotels outside the noise maps', async () => {
    const hotel = await loadHotel(ID)
    expect(hotel?.name).toBe('INNSiDE by Melia Valencia Oceanic')
    expect((await loadHotelDetails(ID))?.facts.roomFloors).toBe(10)
    expect((await loadHiddenHotelIds()).size).toBe(16)
  })

  it('answers the view of every floor and the noise at the facade from the recorded calls', async () => {
    const hotel = (await loadHotel(ID))!
    const details = (await loadHotelDetails(ID))!
    const view = await loadHotelView(hotel, details.building, details.facts.roomFloors, details.nearby)
    expect(view?.window).toBeTruthy()
    expect(view?.rays.length).toBeGreaterThan(0)
    const noise = await loadHotelNoise(hotel)
    expect(noise?.places.length).toBeGreaterThan(0)
  })
})
