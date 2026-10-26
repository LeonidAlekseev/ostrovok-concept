import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { destinations } from '../data/destinations'
import { hotels, getHotel } from './catalogGenerator'
import {
  axisShares,
  BALANCE,
  fillVibe,
  poleImage,
  readVibe,
  VIBE_AXES,
  VIBE_HOTELS,
  vibeArchetype,
  vibeHotels,
  vibeScale,
  vibeWish,
  type Answer,
} from './vibe'

const all = (answer: Answer): Answer[] => VIBE_AXES.map(() => answer)
const catalogue = hotels.map((h) => getHotel(h.id)!)
const scale = vibeScale(catalogue, destinations)

describe('VIBE_AXES', () => {
  it('spans the catalogue: the nearest hotel is fully central, the farthest fully remote', () => {
    const location = VIBE_AXES.find((axis) => axis.id === 'location')!
    const fits = catalogue.map((h) => [h.distanceKm, location.fit(h, scale)] as const).sort((a, b) => a[0] - b[0])
    expect(fits[0][1]).toBe(1)
    expect(fits.at(-1)![1]).toBe(-1)
  })

  it('has seven pairs, the first one is «Уютный вечер» / «Шумная вечеринка»', () => {
    expect(VIBE_AXES).toHaveLength(7)
    expect(VIBE_AXES[0]).toMatchObject({ left: 'Уютный вечер', right: 'Шумная вечеринка' })
  })

  it('keeps every fit in [−1, 1]', () => {
    for (const axis of VIBE_AXES)
      for (const hotel of catalogue) {
        const fit = axis.fit(hotel, scale)
        expect(fit, `${axis.id} ${hotel.id}`).toBeGreaterThanOrEqual(-1)
        expect(fit, `${axis.id} ${hotel.id}`).toBeLessThanOrEqual(1)
      }
  })

  it('takes a hotel with no rates as neutral on «Завтрак в номер» / «Ужин в новом месте», not NaN', () => {
    const food = VIBE_AXES.find((axis) => axis.id === 'food')!
    expect(food.fit({ ...catalogue[0], rooms: [] }, scale)).toBe(0)
  })

  it('tells hotels apart on every axis', () => {
    for (const axis of VIBE_AXES)
      expect(new Set(catalogue.map((h) => axis.fit(h, scale))).size, axis.id).toBeGreaterThan(1)
  })
})

// vibe-search, Requirement: Фото вариантов
describe('vibe photos', () => {
  const file = (image: string) => join(process.cwd(), 'public', image)

  it('has a photo for each of the 14 poles and for «Баланс во всём»', () => {
    const images = [...VIBE_AXES.flatMap((axis) => [poleImage(axis.id, -1), poleImage(axis.id, 1)]), BALANCE.image]
    expect(images).toHaveLength(15)
    for (const image of images) expect(existsSync(file(image)), image).toBe(true)
  })

  it('shows the photo of the main pole for an archetype and its own for «Баланс во всём»', () => {
    expect(vibeArchetype([-1, 0, 0, 0, 0, 0, -1]).image).toBe('/images/vibe/evening-left.webp')
    expect(vibeArchetype([0, 0, 0, 0, 0, 1, 0]).image).toBe('/images/vibe/size-right.webp')
    expect(vibeArchetype(all(0)).image).toBe('/images/vibe/balance.webp')
  })
})

// vibe-search, Requirement: Статистика вайба
describe('axisShares', () => {
  it('gives 100/0 to the left option, 0/100 to the right one and 50/50 to «Не могу выбрать»', () => {
    const shares = axisShares([-1, 1, 0, -1, 1, 0, -1])
    expect(shares.map((s) => [s.left, s.right])).toEqual([
      [100, 0],
      [0, 100],
      [50, 50],
      [100, 0],
      [0, 100],
      [50, 50],
      [100, 0],
    ])
  })
})

describe('vibeArchetype', () => {
  it('is «Баланс во всём» when every answer is «Не могу выбрать»', () => {
    expect(vibeArchetype(all(0))).toBe(BALANCE)
    expect(BALANCE.name).toBe('Баланс во всём')
  })

  it('names the vibe by the two answers it matches', () => {
    // «Уютный вечер» and «Подальше от суеты».
    expect(vibeArchetype([-1, 0, 0, 0, 0, 0, -1]).name).toBe('Тихая гавань')
    // «Шумная вечеринка» and «Гулять до ночи».
    expect(vibeArchetype([1, 0, 0, 1, 0, 0, 0]).name).toBe('Душа вечеринки')
    // «Море» and «Спа и бассейн».
    expect(vibeArchetype([0, -1, 0, -1, 0, 0, 0]).name).toBe('Морской гедонист')
  })

  it('takes «Морской гедонист» for «Море», «Спа и бассейн» and «Завтрак в номер»', () => {
    expect(vibeArchetype([0, -1, 0, -1, -1, 0, 0]).name).toBe('Морской гедонист')
  })

  it('breaks a tie by the main axis, not the table order', () => {
    // «Подальше от суеты» is the second pole of «Тихая гавань», «Море» the main one of «Морской гедонист».
    expect(vibeArchetype([0, -1, 0, 0, 0, 0, -1]).name).toBe('Морской гедонист')
  })

  it('has a vibe for any single answer', () => {
    for (let i = 0; i < VIBE_AXES.length; i++)
      for (const answer of [-1, 1] as const) {
        const answers = all(0)
        answers[i] = answer
        expect(vibeArchetype(answers), `${VIBE_AXES[i].id} ${answer}`).not.toBe(BALANCE)
      }
  })
})

// vibe-search, Requirement: Отели под настроение
describe('vibeHotels', () => {
  it('picks six hotels from different cities', () => {
    for (const answers of [all(-1), all(1), all(0), [1, -1, 0, 1, -1, 0, 1] as Answer[]]) {
      const picked = vibeHotels(answers, catalogue, destinations)
      expect(picked).toHaveLength(VIBE_HOTELS)
      expect(new Set(picked.map((h) => h.destinationId)).size).toBe(VIBE_HOTELS)
    }
  })

  it('gives the same list for the same answers', () => {
    const answers: Answer[] = [1, 0, -1, 1, 0, -1, 1]
    expect(vibeHotels(answers, catalogue, destinations).map((h) => h.id)).toEqual(
      vibeHotels([...answers], catalogue, destinations).map((h) => h.id),
    )
  })

  it('fits «Уютный вечер» everywhere: far from the centre, without a bar', () => {
    for (const hotel of vibeHotels(all(-1), catalogue, destinations)) {
      expect(hotel.amenities, hotel.id).not.toContain('bar')
      expect(hotel.distanceKm, hotel.id).toBeGreaterThan(2.5)
    }
  })

  it('fits the right options everywhere: a bar, four or five stars', () => {
    for (const hotel of vibeHotels(all(1), catalogue, destinations)) {
      expect(hotel.amenities, hotel.id).toContain('bar')
      expect(hotel.stars, hotel.id).toBeGreaterThanOrEqual(4)
    }
  })

  it('takes the best rated hotels when nothing is chosen', () => {
    const ratings = vibeHotels(all(0), catalogue, destinations).map((h) => h.rating)
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a))
  })
})

describe('readVibe', () => {
  it('returns the archetype, seven shares and six hotels', () => {
    const vibe = readVibe(all(-1), catalogue, destinations)
    expect(vibe.shares).toHaveLength(7)
    expect(vibe.hotels).toHaveLength(6)
    expect(vibe.archetype.name).toBeTruthy()
  })
})

describe('vibeWish', () => {
  it('names the archetype and the chosen sides', () => {
    expect(vibeWish([-1, -1, 0, 0, 0, 0, 0])).toBe(
      'Тихая гавань: тишина, простор и вечер без спешки. Настроение: Уютный вечер, Море.',
    )
    expect(vibeWish(all(1))).toContain('Настроение: Шумная вечеринка, Город, Большой отель')
  })

  it('is empty when nothing is chosen', () => {
    expect(vibeWish(all(0))).toBe('')
  })
})

describe('fillVibe', () => {
  it('keeps the best hotel of each city first, then fills up to VIBE_HOTELS from the cities taken', () => {
    const picked = fillVibe(catalogue)
    expect(picked).toHaveLength(VIBE_HOTELS)
    expect(new Set(picked.map((h) => h.destinationId)).size).toBe(VIBE_HOTELS)
    expect(picked[0]).toBe(catalogue[0])
  })

  it('takes six hotels of one city when it is the only one', () => {
    const city = catalogue[0].destinationId
    const oneCity = catalogue.filter((h) => h.destinationId === city)
    const picked = fillVibe(oneCity)
    expect(picked).toHaveLength(VIBE_HOTELS)
    expect(picked.every((h) => h.destinationId === city)).toBe(true)
    expect(picked).toEqual(oneCity.slice(0, VIBE_HOTELS))
  })

  it('takes one hotel per city when there are six or more cities', () => {
    const cities = [...new Set(catalogue.map((h) => h.destinationId))]
    const picked = fillVibe(catalogue)
    expect(picked.map((h) => h.destinationId)).toEqual(cities.slice(0, VIBE_HOTELS))
  })

  it('fills from the cities taken, in the order of the ranking', () => {
    const [x, y] = [...new Set(catalogue.map((h) => h.destinationId))]
    const of = (city: string) => catalogue.filter((h) => h.destinationId === city)
    const [x1, x2, x3] = of(x)
    const [y1, y2, y3] = of(y)
    const ranked = [x1, y1, x2, y2, x3, y3]
    expect(fillVibe(ranked).map((h) => h.id)).toEqual(ranked.map((h) => h.id))
  })
})
