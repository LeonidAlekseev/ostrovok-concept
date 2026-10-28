import { describe, expect, it } from 'vitest'
import { parseData } from './assistantChats'
import { MAX_WIDGET_PLACES, noiseWidget, parseChatWidget, type ChatWidget } from './chatWidget'
import type { HotelNoise } from './noise'

const hotel = { id: 'ota-1', name: 'Hotel Turia', lat: 39.4735, lon: -0.3799 }
const noise: HotelNoise = {
  sources: [{ source: 'roadsInAgglomeration', lden: { min: 60, max: 64 } }],
  yard: [],
  zone: { kind: 'building', buildingId: 'b1', bufferM: 10 },
  places: [{ category: 'bar', name: null, distanceM: 40, lat: 39.474, lon: -0.38 }],
  placesCovered: ['bar'],
}
const view: ChatWidget = { kind: 'view', hotel, floor: 5, date: '2026-06-21', focus: ['sunset'], places: [] }

// assistant-geo, Requirement: Виджеты карт в ответе Эвала
describe('the widget of an answer', () => {
  it('reads a stored widget of either kind, and in a saved message', () => {
    const widget = noiseWidget({ ...hotel, extra: true } as typeof hotel, noise)
    expect(widget.hotel).toEqual(hotel)
    expect(parseChatWidget(widget)).toEqual(widget)
    expect(parseChatWidget(view)).toEqual(view)
    expect(parseData({ widget: view })).toEqual({ widget: view })
  })

  it('drops a widget off the shape, the rest of the message kept', () => {
    expect(parseChatWidget({ ...view, kind: 'photo' })).toBeUndefined()
    expect(parseChatWidget({ ...view, date: '21.06.2026' })).toBeUndefined()
    expect(parseChatWidget({ ...view, places: [{ name: 'X' }] })).toBeUndefined()
    expect(parseData({ widget: { kind: 'noise', hotel }, unverified: 'а' })).toEqual({ unverified: 'а' })
  })

  it('keeps the loud places within the bound', () => {
    const many = { ...noise, places: Array.from({ length: MAX_WIDGET_PLACES + 5 }, () => noise.places[0]) }
    const widget = noiseWidget(hotel, many)
    expect(widget.noise.places).toHaveLength(MAX_WIDGET_PLACES)
    expect(parseChatWidget(widget)).toBeDefined()
  })
})
