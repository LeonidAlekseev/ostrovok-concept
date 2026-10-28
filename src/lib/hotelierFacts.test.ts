import { describe, expect, it } from 'vitest'
import { asksHotelier, characteristicLabel, keyOfProperty, needsHotelier, questionKeys } from './hotelierFacts'

describe('the characteristics a hotelier is asked about', () => {
  it('reads the topics of a question', () => {
    expect(questionKeys('Есть ли балкон и окна на запад?')).toEqual(['room.balcony', 'room.window_side'])
    expect(questionKeys('Шумно ли на 3-м этаже?')).toEqual(['room.floors', 'room.noise'])
    expect(questionKeys('Как дела?')).toEqual([])
  })

  it('tells what only the hotel confirms, and a request to ask the hotel', () => {
    expect(needsHotelier('Есть ли свободные номера на эти даты?')).toBe(true)
    expect(needsHotelier('Гарантируете вид на море?')).toBe(true)
    expect(needsHotelier('Есть ли балкон?')).toBe(false)
    expect(asksHotelier('Уточните у отеля, пожалуйста')).toBe(true)
    expect(asksHotelier('Спросите отельера про балкон')).toBe(true)
    expect(asksHotelier('Есть ли балкон?')).toBe(false)
  })

  it('names the claims of the hotelier, and only theirs', () => {
    expect(keyOfProperty('hotelier.room.balcony')).toBe('room.balcony')
    expect(keyOfProperty('noise.lday.estimate')).toBeNull()
    expect(keyOfProperty('hotelier.room.unknown')).toBeNull()
    expect(characteristicLabel('room.window_side')).toBe('Сторона окон')
    expect(characteristicLabel('something.else')).toBe('something.else')
  })
})
