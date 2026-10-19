'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Info } from 'lucide-react'
import { TextField } from '@/components/BookingFields/TextField'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldGroup } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import {
  EMPTY_REGISTER,
  signIn,
  validateLogin,
  validateRegister,
  type LoginValues,
  type RegisterValues,
} from '@/lib/auth'
import type { FormErrors } from '@/lib/booking'
import { focusField } from '@/lib/focusField'

export type AuthMode = 'login' | 'register'

interface Props {
  mode: AuthMode
  /** Called after the session is created. */
  onDone: () => void
}

function DemoNote() {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>Демо-вход: подойдут любой email и пароль от 8 символов. Пароль нигде не сохраняется.</span>
    </p>
  )
}

/** The sign-in or the registration form; the same in the dialog and on the full page. */
export function AuthForm({ mode, onDone }: Props) {
  const register = mode === 'register'
  const [values, setValues] = useState<RegisterValues>(EMPTY_REGISTER)
  const [errors, setErrors] = useState<FormErrors>({})
  const change = (next: Partial<RegisterValues>) => setValues((current) => ({ ...current, ...next }))

  function submit(event: FormEvent) {
    event.preventDefault()
    const found = register ? validateRegister(values) : validateLogin(values as LoginValues)
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) {
      focusField(first)
      return
    }
    signIn(values.email, register ? values.name : undefined)
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DemoNote />
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
        <TextField
          id="password"
          label="Пароль"
          type="password"
          autoComplete={register ? 'new-password' : 'current-password'}
          value={values.password}
          onChange={(password) => change({ password })}
          error={errors.password}
        />
        {register && (
          <TextField
            id="repeat"
            label="Повторите пароль"
            type="password"
            autoComplete="new-password"
            value={values.repeat}
            onChange={(repeat) => change({ repeat })}
            error={errors.repeat}
          />
        )}
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
      <Button type="submit" size="lg" className="w-full">
        {register ? 'Зарегистрироваться' : 'Войти'}
      </Button>
    </form>
  )
}
