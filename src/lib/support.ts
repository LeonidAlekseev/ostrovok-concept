/** The support form of the help centre (`/help`): its values and their check, with the booking form's rules. */
import { validateEmail, validateName, type FormErrors } from './booking'

export interface SupportValues {
  name: string
  email: string
  /** Optional. */
  booking: string
  message: string
}

export const EMPTY_SUPPORT: SupportValues = { name: '', email: '', booking: '', message: '' }

/** The booking number is optional, the rest is required. */
export function validateSupport({ name, email, message }: SupportValues): FormErrors {
  const errors: FormErrors = {}
  const add = (id: string, error: string | undefined) => {
    if (error) errors[id] = error
  }
  add('support-name', validateName(name, 'Введите имя'))
  add('support-email', validateEmail(email))
  add('support-message', validateName(message, 'Опишите вопрос'))
  return errors
}
