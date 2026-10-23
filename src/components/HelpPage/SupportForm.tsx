'use client'

import { useState, type FormEvent } from 'react'
import { CircleCheck } from 'lucide-react'
import { TextField } from '@/components/BookingFields/TextField'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import type { FormErrors } from '@/lib/booking'
import { focusField } from '@/lib/focusField'
import { EMPTY_SUPPORT, validateSupport, type SupportValues } from '@/lib/support'

/** The demo contact form: nothing is sent over the network or stored. */
export function SupportForm() {
  const [values, setValues] = useState<SupportValues>(EMPTY_SUPPORT)
  const [errors, setErrors] = useState<FormErrors>({})
  const [sentTo, setSentTo] = useState<string | null>(null)
  const change = (next: Partial<SupportValues>) => setValues((current) => ({ ...current, ...next }))

  function submit(event: FormEvent) {
    event.preventDefault()
    const found = validateSupport(values)
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) {
      focusField(first)
      return
    }
    setSentTo(values.email.trim())
    setValues(EMPTY_SUPPORT)
  }

  if (sentTo) {
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-lg bg-muted p-4">
        <p className="flex items-start gap-2 font-medium">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <span>Обращение отправлено (демо): ответ придёт на {sentTo}</span>
        </p>
        <Button variant="outline" size="sm" onClick={() => setSentTo(null)}>
          Написать ещё
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <FieldGroup>
        <TextField
          id="support-name"
          label="Имя"
          autoComplete="name"
          value={values.name}
          onChange={(name) => change({ name })}
          error={errors['support-name']}
        />
        <TextField
          id="support-email"
          label="Email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(email) => change({ email })}
          error={errors['support-email']}
        />
        <TextField
          id="support-booking"
          label="Номер бронирования (необязательно)"
          placeholder="OS-ABC123"
          value={values.booking}
          onChange={(booking) => change({ booking })}
        />
        <Field data-invalid={errors['support-message'] ? true : undefined}>
          <FieldLabel htmlFor="support-message">Сообщение</FieldLabel>
          <Textarea
            id="support-message"
            value={values.message}
            onChange={(event) => change({ message: event.target.value })}
            aria-invalid={errors['support-message'] ? true : undefined}
            aria-describedby={errors['support-message'] ? 'support-message-error' : undefined}
          />
          {errors['support-message'] && <FieldError id="support-message-error">{errors['support-message']}</FieldError>}
        </Field>
      </FieldGroup>
      <p className="text-sm text-muted-foreground">Демо-форма: данные никуда не отправляются и не сохраняются.</p>
      <Button type="submit" size="lg" className="w-full sm:w-auto">
        Отправить
      </Button>
    </form>
  )
}
