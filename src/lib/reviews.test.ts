import { describe, expect, it } from 'vitest'
import { ratingLabel } from './reviews'

// hotel-page, Requirement: Блок оценки
describe('ratingLabel', () => {
  it('names the rating at the bounds 9, 8, 7 and 6', () => {
    expect(ratingLabel(9.8)).toBe('Превосходно')
    expect(ratingLabel(9)).toBe('Превосходно')
    expect(ratingLabel(8.9)).toBe('Отлично')
    expect(ratingLabel(8)).toBe('Отлично')
    expect(ratingLabel(7.9)).toBe('Очень хорошо')
    expect(ratingLabel(7)).toBe('Очень хорошо')
    expect(ratingLabel(6.9)).toBe('Хорошо')
    expect(ratingLabel(6)).toBe('Хорошо')
    expect(ratingLabel(5.9)).toBe('Неплохо')
  })
})
