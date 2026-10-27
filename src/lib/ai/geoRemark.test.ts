import { describe, expect, it } from 'vitest'
import { checkedRemark } from './geoRemark'

const facts = [
  'По данным Островка и OpenStreetMap:',
  '• Больница: ближе всего — «Hospital Clínic Universitari», 1,2 км от отеля по прямой; пешком 1,5 км, около 19 мин.',
  '• Море (ближайший пляж): ближе всего — «Platja de la Malva-rosa», 3,1 км от отеля по прямой.',
].join('\n')

// assistant-geo, Requirement: Проверка фразы
describe('the checks of a remark', () => {
  it('keep a sentence of advice in Russian, the period added', () => {
    expect(checkedRemark('До больницы удобно дойти пешком, а к морю лучше взять такси', facts)).toBe(
      'До больницы удобно дойти пешком, а к морю лучше взять такси.',
    )
    expect(checkedRemark('«К морю лучше ехать на такси.»', facts)).toBe('К морю лучше ехать на такси.')
  })

  it('keep a name the facts have, in another form too', () => {
    expect(checkedRemark('Пляж Malva-rosa — хороший выбор для вечерней прогулки.', facts)).toBeDefined()
    expect(checkedRemark('До метро удобно дойти пешком.', facts)).toBeDefined()
  })

  it('drop a number, a word of a number or a unit', () => {
    for (const remark of [
      'До моря около 3 км.',
      'До моря несколько километров.',
      'До больницы минут пятнадцать пешком.',
      'Пляж в паре кварталов от отеля.',
      'Больница в двух шагах.',
      'Дорога займёт полчаса.',
    ])
      expect(checkedRemark(remark, facts), remark).toBeUndefined()
  })

  it('drop a walk when the facts have no route on foot', () => {
    const byCar = '• Аэропорт: ближе всего — «Валенсия» (аэропорт), 7,7 км от отеля; на машине 9,3 км, около 11 мин.'
    expect(checkedRemark('До аэропорта легко дойти пешком.', byCar)).toBeUndefined()
    expect(checkedRemark('До аэропорта удобнее доехать на такси.', byCar)).toBeDefined()
  })

  it('drop a name the facts do not have', () => {
    expect(checkedRemark('Рядом также есть Hospital La Fe.', facts)).toBeUndefined()
    expect(checkedRemark('Загляните на пляж «Пинедо» по дороге.', facts)).toBeUndefined()
    expect(checkedRemark('По пути можно зайти в Центральный рынок.', facts)).toBeUndefined()
  })

  it('drop another language, several sentences or a long text', () => {
    expect(checkedRemark('The beach is best reached by taxi.', facts)).toBeUndefined()
    expect(checkedRemark('До больницы недалеко. К морю лучше на такси.', facts)).toBeUndefined()
    expect(checkedRemark(`К морю ${'очень '.repeat(40)}удобно.`, facts)).toBeUndefined()
    expect(checkedRemark('Да.', facts)).toBeUndefined()
  })
})
