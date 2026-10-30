'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { TextField } from '@/components/BookingFields/TextField'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldGroup } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { EMPTY_REGISTER, validateLogin, validateRegister, type RegisterValues } from '@/lib/auth'
import type { FormErrors } from '@/lib/booking'
import { focusField } from '@/lib/focusField'

const EMAIL_UNAVAILABLE = 'Вход по почте недоступен в демо-версии: войдите в демо-аккаунт'

export type AuthMode = 'login' | 'register'

interface Props {
  mode: AuthMode
  /** The internal path the link from the email opens. */
  next: string
  /** An error to show at once, e.g. an expired link. */
  initialError?: string
}

export function FormAlert({ children }: { children: string }) {
  return (
    <p role="alert" className="m-0 text-sm text-destructive">
      {children}
    </p>
  )
}

/** The sign-in or the registration form; the same in the dialog and on the full page. Both send a one-time link. */
export function AuthForm({ mode, initialError }: Props) {
  const register = mode === 'register'
  const [values, setValues] = useState<RegisterValues>(EMPTY_REGISTER)
  const [errors, setErrors] = useState<FormErrors>({})
  const [formError, setFormError] = useState(initialError)
  const change = (patch: Partial<RegisterValues>) => setValues((current) => ({ ...current, ...patch }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    const found = register ? validateRegister(values) : validateLogin(values)
    setErrors(found)
    setFormError(undefined)
    const first = Object.keys(found)[0]
    if (first) {
      focusField(first)
      return
    }
    // The standalone demo sends no emails: only the demo accounts sign in (the buttons below the form).
    setFormError(EMAIL_UNAVAILABLE)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <FieldGroup>
        {register && (
          <TextField
            id="name"
            label="Имя"
            autoComplete="name"
            value={values.name}
            onChange={(name) => change({ name })}
            error={errors.name}
          />
        )}
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(email) => change({ email })}
          error={errors.email}
        />
        {register && (
          <Field data-invalid={errors.agreed ? true : undefined}>
            <div className="flex items-start gap-2">
              <Checkbox
                id="agreed"
                checked={values.agreed}
                onCheckedChange={(agreed) => change({ agreed })}
                aria-invalid={errors.agreed ? true : undefined}
                aria-describedby={errors.agreed ? 'agreed-error' : undefined}
              />
              <Label htmlFor="agreed" className="inline leading-snug font-normal">
                Я принимаю{' '}
                <Link className="underline" href="/legal/terms" target="_blank">
                  условия использования
                </Link>
              </Label>
            </div>
            {errors.agreed && <FieldError id="agreed-error">{errors.agreed}</FieldError>}
          </Field>
        )}
      </FieldGroup>
      {formError && <FormAlert>{formError}</FormAlert>}
      <Button type="submit" size="lg" className="w-full">
        {register ? 'Зарегистрироваться' : 'Отправить ссылку'}
      </Button>
      <p className="m-0 text-sm text-muted-foreground">Пароль не нужен: войдите по ссылке из письма.</p>
    </form>
  )
}
