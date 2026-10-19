import type { ComponentProps } from 'react'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

interface Props extends Omit<ComponentProps<'input'>, 'id' | 'onChange' | 'value'> {
  /** The field id; it is also the key of the field's error. */
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
}

/** A labelled input with its error under it; the error is linked with `aria-describedby`. */
export function TextField({ id, label, value, onChange, error, ...props }: Props) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  )
}
