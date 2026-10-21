'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'
import { TextField } from '@/components/BookingFields/TextField'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldGroup } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { EMPTY_REGISTER, validateLogin, validateRegister, type RegisterValues } from '@/lib/auth'
import type { FormErrors } from '@/lib/booking'
import { focusField } from '@/lib/focusField'
import { getBrowserClient } from '@/lib/supabase/client'
import { AUTH_UNAVAILABLE } from '@/lib/supabase/config'

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
export function AuthForm({ mode, next, initialError }: Props) {
  const register = mode === 'register'
  const [values, setValues] = useState<RegisterValues>(EMPTY_REGISTER)
  const [errors, setErrors] = useState<FormErrors>({})
  const [formError, setFormError] = useState(initialError)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
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
    const supabase = getBrowserClient()
    if (!supabase) {
      setFormError(AUTH_UNAVAILABLE)
      return
    }
    const email = values.email.trim()
    setPending(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // A sign-in with a new email creates the account too; its name then comes from the email.
        data: register ? { name: values.name.trim() } : undefined,
      },
    })
    setPending(false)
    if (!error) setSentTo(email)
    else
      setFormError(
        error.status === 429
          ? 'Слишком много писем подряд: попробуйте через минуту'
          : 'Не удалось отправить ссылку, попробуйте ещё раз',
      )
  }

  if (sentTo) {
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-lg bg-muted p-4">
        <MailCheck className="size-6 text-primary" aria-hidden />
        <p className="m-0 text-base font-[650]">Проверьте почту</p>
        <p className="m-0 text-sm text-muted-foreground">
          Мы отправили ссылку для входа на <span className="font-[550] text-foreground">{sentTo}</span>. Откройте её в
          этом браузере — ссылка действует один раз.
        </p>
        <Button variant="link" onClick={() => setSentTo(null)}>
          Изменить почту
        </Button>
      </div>
    )
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
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {register ? 'Зарегистрироваться' : 'Отправить ссылку'}
      </Button>
      <p className="m-0 text-sm text-muted-foreground">Пароль не нужен: войдите по ссылке из письма.</p>
    </form>
  )
}
