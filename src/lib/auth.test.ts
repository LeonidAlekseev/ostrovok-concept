// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { nameFromEmail, resolveNext, signIn, signOut, validateLogin, validateRegister } from './auth'
import { bookingsStore, favoritesStore, sessionStore } from './storage'

beforeEach(() => window.localStorage.clear())

describe('validateLogin', () => {
  it('accepts any email and a password of 8 characters', () => {
    expect(validateLogin({ email: 'anna@example.com', password: '12345678' })).toEqual({})
  })

  it('rejects a short password and a bad email', () => {
    expect(validateLogin({ email: 'anna@example.com', password: '12345' })).toEqual({
      password: 'Не меньше 8 символов',
    })
    expect(Object.keys(validateLogin({ email: 'anna', password: '12345678' }))).toEqual(['email'])
  })
})

describe('validateRegister', () => {
  const valid = { name: 'Анна', email: 'anna@example.com', password: '12345678', repeat: '12345678', agreed: true }

  it('accepts a complete form', () => expect(validateRegister(valid)).toEqual({}))

  it('checks every field, in form order', () => {
    const errors = validateRegister({ name: ' ', email: '', password: '1', repeat: '2', agreed: false })
    expect(Object.keys(errors)).toEqual(['name', 'email', 'password', 'repeat', 'agreed'])
    expect(errors.repeat).toBe('Пароли не совпадают')
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

describe('session', () => {
  it('takes the name from the email when none is given', () => {
    expect(signIn('anna@example.com')).toEqual({ name: 'anna', email: 'anna@example.com' })
    expect(nameFromEmail(' a.b@x.ru ')).toBe('a.b')
  })

  it('uses the registered name, and keeps it on a later sign-in with the same email', () => {
    signIn('anna@example.com', 'Анна Петрова')
    expect(signIn('anna@example.com').name).toBe('Анна Петрова')
    expect(signIn('boris@example.com').name).toBe('boris')
  })

  it('stores no password', () => {
    signIn('anna@example.com')
    expect(window.localStorage.getItem(sessionStore.key)).toBe('{"name":"anna","email":"anna@example.com"}')
  })

  it('signOut removes only the session', () => {
    favoritesStore.set(['h1'])
    signIn('anna@example.com')
    signOut()
    expect(sessionStore.get()).toBeNull()
    expect(favoritesStore.get()).toEqual(['h1'])
    expect(bookingsStore.get()).toEqual([])
  })
})
