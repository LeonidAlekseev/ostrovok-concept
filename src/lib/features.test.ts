import { describe, expect, it } from 'vitest'
import {
  bandLabel,
  featureLines,
  featureReasons,
  featuresOf,
  missingCriteria,
  rankByFeatures,
  viewsOfRoomName,
  type HotelFeatures,
} from './features'

const quietLow: HotelFeatures = { floors: 3, heightM: 10, lnight: { max: 39 }, lden: { min: 45, max: 49 }, views: [] }
const quietHigh: HotelFeatures = { floors: 12, heightM: 38, lnight: { max: 39 }, lden: { min: 50, max: 54 }, views: [] }
const loudHigh: HotelFeatures = { floors: 21, lnight: { min: 60, max: 64 }, views: [] }
const seaView: HotelFeatures = {
  floors: 7,
  lnight: { min: 50, max: 54 },
  views: [
    { roomName: 'Двухместный номер Standard с видом на море', view: 'sea' },
    { roomName: 'Номер Standard с видом на город', view: 'city' },
  ],
}
const features = new Map(Object.entries({ quietLow, quietHigh, loudHigh, seaView }))
const ids = ['loudHigh', 'quietLow', 'seaView', 'quietHigh', 'noData']

describe('viewsOfRoomName', () => {
  it.each([
    ['Двухместный номер Standard с видом на море', ['sea']],
    ['Люкс с видом на океан', ['sea']],
    ['Номер Standard с видом на воду', ['water']],
    ['Апартаменты Luxury с 2 комнатами с балконом и с видом на парк', ['park']],
    ['Двухместный номер Standard с видом на внутренний двор', ['courtyard']],
    ['Номер Standard с красивым видом из окна', ['nice']],
    ['Двухместный номер Premium with Plaza View', ['city']],
    ['Двухместный номер Meliá Classic Interior View', ['courtyard']],
    ['Двухместный номер Deluxe с видом на City of Arts and Sciences', ['city']],
    ['Двухместный номер Standard с балконом', []],
    ['Одноместный номер', []],
  ])('%s', (name, views) => {
    expect(viewsOfRoomName(name)).toEqual(views)
  })
})

describe('bandLabel', () => {
  it('names the bands with the open ends', () => {
    expect(bandLabel({ min: 45, max: 49 })).toBe('45–49 дБ')
    expect(bandLabel({ max: 39 })).toBe('ниже 40 дБ')
    expect(bandLabel({ min: 70 })).toBe('70 дБ и выше')
  })
})

// assistant-search, Requirement: Подбор по свойствам здания и окружения
describe('rankByFeatures', () => {
  it('puts the quietest night first (Scenario: Тихий отель)', () => {
    expect(rankByFeatures(ids, features, { quiet: true })).toEqual(['quietLow', 'quietHigh', 'seaView', 'loudHigh'])
  })

  it('picks the taller among the quiet ones (Scenario: Уточнение)', () => {
    expect(rankByFeatures(ids, features, { quiet: true, height: 'high' })).toEqual([
      'quietHigh',
      'quietLow',
      'seaView',
      'loudHigh',
    ])
  })

  it('keeps only the hotels with a room of the view', () => {
    expect(rankByFeatures(ids, features, { view: 'sea' })).toEqual(['seaView'])
    expect(rankByFeatures(ids, features, { view: 'any' })).toEqual(['seaView'])
  })

  it('ranks nothing without criteria', () => {
    expect(rankByFeatures(ids, features, {})).toEqual([])
  })
})

describe('missingCriteria', () => {
  it('names the criteria no hotel has data for (Scenario: Нет данных)', () => {
    expect(missingCriteria(['noData'], features, { quiet: true, height: 'high' })).toEqual(['quiet', 'height'])
    expect(missingCriteria(ids, features, { quiet: true, view: 'mountain' })).toEqual(['view'])
  })
})

describe('featureReasons', () => {
  it('tells the night noise and the floors', () => {
    expect(featureReasons(quietHigh, { quiet: true, height: 'high' })).toEqual([
      'ночью ниже 40 дБ, за сутки 50–54 дБ',
      'здание 12 этажей, 38 м',
    ])
  })

  it('names the room types with the view, from their description (Scenario: Вид не у всех номеров)', () => {
    expect(featureReasons(seaView, { view: 'sea' })).toEqual([
      'с видом на море: Двухместный номер Standard с видом на море (по описанию)',
    ])
  })

  it('says there is no data instead of guessing', () => {
    expect(featureReasons(undefined, { quiet: true, view: 'sea' })).toEqual([
      'нет данных о шуме',
      'нет данных о виде из окна',
    ])
    expect(featureReasons(quietLow, { view: 'sea' })).toEqual(['в описании номеров нет вида на море'])
  })
})

describe('featureLines', () => {
  it('adds the building, the noise and the views to the hotel’s text', () => {
    expect(featureLines(seaView)).toEqual([
      'Здание: 7 этажей.',
      'Шум по карте шума: ночью 50–54 дБ.',
      'Номера с видом (по описанию): на море, на город.',
    ])
    expect(featureLines(quietLow)[1]).toBe('Шум по карте шума: ночью ниже 40 дБ, за сутки 45–49 дБ — тихо ночью.')
    expect(featureLines(undefined)).toEqual([])
  })
})

describe('featuresOf', () => {
  it('reads the rows of the tables', () => {
    const map = featuresOf(
      [{ hotel_id: 'ota-1', floors: 9, height_m: 30.5, lden_min: 70, lden_max: 74, lnight_min: null, lnight_max: 39 }],
      [
        { hotel_id: 'ota-1', view: 'sea', room_name: 'Люкс с видом на море' },
        { hotel_id: 'ota-2', view: 'city', room_name: 'Номер с видом на город' },
        { hotel_id: 'ota-2', view: 'moon', room_name: 'Номер' },
      ],
    )
    expect(map.get('ota-1')).toEqual({
      floors: 9,
      heightM: 30.5,
      lden: { min: 70, max: 74 },
      lnight: { max: 39 },
      views: [{ roomName: 'Люкс с видом на море', view: 'sea' }],
    })
    expect(map.get('ota-2')).toEqual({ views: [{ roomName: 'Номер с видом на город', view: 'city' }] })
  })
})
