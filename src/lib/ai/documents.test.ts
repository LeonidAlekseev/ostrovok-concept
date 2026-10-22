import { describe, expect, it } from 'vitest'
import { destinations } from '../../data/destinations'
import { allHotels } from '@/test/catalog'
import { vibeScale } from '../vibe'
import { hotelDocument, routeDocument, vibePoles } from './documents'

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
})

describe('routeDocument', () => {
  it('names the route, the style and the leisure', () => {
    const text = routeDocument(
      {
        title: 'Культурный отпуск в Праге',
        persona: 'culture',
        description: 'Пять ночей',
        leisure: [{ title: 'Пражский Град', category: 'Экскурсия' }, {}],
      },
      city('prague'),
    )
    expect(text).toBe(
      'Маршрут «Культурный отпуск в Праге» — Прага, Чехия.\nСтиль: культурный.\nПять ночей.\nДосуг: Пражский Град (экскурсия).',
    )
  })
})
