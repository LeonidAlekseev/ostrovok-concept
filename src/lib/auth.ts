import { validateEmail, validateName, type FormErrors } from './booking'

/** Sign-in by a one-time link sent to the email: the forms ask no password. */

export interface LoginValues {
  email: string
}

export interface RegisterValues extends LoginValues {
  name: string
  agreed: boolean
}

export const EMPTY_REGISTER: RegisterValues = { name: '', email: '', agreed: false }

function collect(checks: [string, string | undefined][]): FormErrors {
  const errors: FormErrors = {}
  for (const [id, message] of checks) if (message) errors[id] = message
  return errors
}

export const validateLogin = ({ email }: LoginValues): FormErrors => collect([['email', validateEmail(email)]])

export const validateRegister = ({ name, email, agreed }: RegisterValues): FormErrors =>
  collect([
    ['name', validateName(name, 'Введите имя')],
    ['email', validateEmail(email)],
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
