import { describe, expect, it } from 'vitest'
import { nameFromEmail, resolveNext, validateLogin, validateRegister } from './auth'

describe('validateLogin', () => {
  it('needs only a valid email', () => {
    expect(validateLogin({ email: 'anna@example.com' })).toEqual({})
    expect(validateLogin({ email: 'anna.example.com' })).toEqual({ email: 'Проверьте email' })
    expect(validateLogin({ email: ' ' })).toEqual({ email: 'Введите email' })
  })
})

describe('validateRegister', () => {
  it('needs a name, an email and the agreement', () => {
    expect(validateRegister({ name: 'Анна', email: 'anna@example.com', agreed: true })).toEqual({})
    expect(validateRegister({ name: ' ', email: 'anna', agreed: false })).toEqual({
      name: 'Введите имя',
      email: 'Проверьте email',
      agreed: 'Нужно принять условия',
    })
  })
})

describe('resolveNext', () => {
  it('is null when not given', () => {
    expect(resolveNext(null)).toBeNull()
    expect(resolveNext('')).toBeNull()
  })

  it('keeps internal paths with their query', () => {
    expect(resolveNext('/trips')).toBe('/trips')
    expect(resolveNext('/booking?hotel=1&room=2')).toBe('/booking?hotel=1&room=2')
  })

  it.each(['//evil.com', 'https://evil.com', '/\\evil.com', 'evil.com', '/\t/evil.com'])('sends %j to /', (next) =>
    expect(resolveNext(next)).toBe('/'),
  )
})

describe('nameFromEmail', () => {
  it('takes the part before @', () => expect(nameFromEmail(' a.b@x.ru ')).toBe('a.b'))
})
