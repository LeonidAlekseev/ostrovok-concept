import { describe, expect, it } from 'vitest'
import { destinations } from '../../data/destinations'
import { allHotels } from '@/test/catalog'
import { vibeScale } from '../vibe'
import { hotelDocument, vibePoles } from './documents'

const hotels = allHotels()
const scale = vibeScale(hotels, destinations)
const city = (id: string) => destinations.find((d) => d.id === id)!

describe('hotelDocument', () => {
  it('names the kind, the city, the Wi‑Fi, the amenities, the mood and the reviews', () => {
    const hostel = hotels.find((h) => h.id === 'prague-skyline-hostel')!
    const text = hotelDocument(hostel, city('prague'), scale)
    expect(text).toMatch(/^Хостел «Skyline Hostel», \d★ — Прага, Чехия\./)
    expect(text).toContain('Wi‑Fi 80 Мбит/с')
    expect(text).toContain('Удобства: ')
    expect(text).toContain(`Настроение: ${vibePoles(hostel, scale).join(', ')}`)
    expect(text.match(/^Отзыв: /gm)?.length).toBe(Math.min(3, hostel.reviews.length))
  })

  it('gives apartments and villas no stars', () => {
    const villa = hotels.find((h) => h.destinationId === 'prague' && h.stayType === 'villa')!
    expect(hotelDocument(villa, city('prague'), scale)).toMatch(/^Вилла «[^»]+» — Прага/)
  })

  it('adds the building, the noise and the room views when the hotel has them', () => {
    const hotel = hotels.find((h) => h.destinationId === 'lisbon')!
    const plain = hotelDocument(hotel, city('lisbon'), scale)
    const text = hotelDocument(hotel, city('lisbon'), scale, {
      floors: 12,
      lnight: { max: 39 },
      views: [{ roomName: 'Люкс с видом на море', view: 'sea' }],
    })
    expect(plain).not.toMatch(/Здание|Шум|видом/)
    expect(text).toContain('Здание: 12 этажей.')
    expect(text).toContain('Шум по карте шума: ночью ниже 40 дБ — тихо ночью.')
    expect(text).toContain('Номера с видом (по описанию): на море.')
  })
})
