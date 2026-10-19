import { validateEmail, validateName, type FormErrors } from './booking'
import { sessionStore, type Session } from './storage'

/** Demo sign-in: there is no backend, any email and a password of 8+ characters are accepted. */

export const MIN_PASSWORD_LENGTH = 8

export const validatePassword = (value: string) =>
  value.length >= MIN_PASSWORD_LENGTH ? undefined : `Не меньше ${MIN_PASSWORD_LENGTH} символов`

export interface LoginValues {
  email: string
  password: string
}

export interface RegisterValues extends LoginValues {
  name: string
  repeat: string
  agreed: boolean
}

export const EMPTY_LOGIN: LoginValues = { email: '', password: '' }
export const EMPTY_REGISTER: RegisterValues = { name: '', email: '', password: '', repeat: '', agreed: false }

function collect(checks: [string, string | undefined][]): FormErrors {
  const errors: FormErrors = {}
  for (const [id, message] of checks) if (message) errors[id] = message
  return errors
}

export const validateLogin = ({ email, password }: LoginValues): FormErrors =>
  collect([
    ['email', validateEmail(email)],
    ['password', validatePassword(password)],
  ])

export const validateRegister = ({ name, email, password, repeat, agreed }: RegisterValues): FormErrors =>
  collect([
    ['name', validateName(name, 'Введите имя')],
    ['email', validateEmail(email)],
    ['password', validatePassword(password)],
    ['repeat', repeat === password ? undefined : 'Пароли не совпадают'],
    ['agreed', agreed ? undefined : 'Нужно принять условия'],
  ])

/**
 * Where to go after signing in: `null` when `next` is not given, the path when it is internal
 * (starts with `/`, not `//`, no backslash or control characters that a browser reads as another
 * host), `/` otherwise.
 */
export function resolveNext(next: string | null | undefined): string | null {
  if (!next) return null
  return next.startsWith('/') &&
    !next.startsWith('//') &&
    ![...next].some((char) => char === '\\' || char.charCodeAt(0) < 32)
    ? next
    : '/'
}

/** The session name when none is known: the part of the email before `@`. */
export const nameFromEmail = (email: string) => email.trim().split('@')[0]

/** Signs in; a session already kept for this email keeps its name. The password is never read here. */
export function signIn(email: string, name?: string): Session {
  const normalized = email.trim()
  const current = sessionStore.get()
  const session: Session = {
    name: name?.trim() || (current?.email === normalized ? current.name : nameFromEmail(normalized)),
    email: normalized,
  }
  sessionStore.set(session)
  return session
}

/** Removes the session only: favorites and bookings stay. */
export const signOut = () => sessionStore.set(null)
