import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import {
  guestFieldId,
  MAX_REQUESTS_LENGTH,
  type BookingFormValues,
  type FormErrors,
  type RoomGuest,
} from '@/lib/booking'
import { TextField } from './TextField'

interface GuestsProps {
  roomGuests: RoomGuest[]
  onChange: (roomGuests: RoomGuest[]) => void
  errors: FormErrors
}

/** The main guest of every room. */
export function GuestsFields({ roomGuests, onChange, errors }: GuestsProps) {
  const set = (room: number, field: keyof RoomGuest, value: string) =>
    onChange(roomGuests.map((guest, i) => (i === room ? { ...guest, [field]: value } : guest)))

  return (
    <FieldGroup>
      {roomGuests.map((guest, i) => (
        <FieldSet key={i}>
          <FieldLegend variant="label">
            {roomGuests.length > 1 ? `Номер ${i + 1}: основной гость` : 'Основной гость'}
          </FieldLegend>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              id={guestFieldId(i, 'firstName')}
              label="Имя"
              autoComplete={i === 0 ? 'given-name' : 'off'}
              value={guest.firstName}
              onChange={(value) => set(i, 'firstName', value)}
              error={errors[guestFieldId(i, 'firstName')]}
            />
            <TextField
              id={guestFieldId(i, 'lastName')}
              label="Фамилия"
              autoComplete={i === 0 ? 'family-name' : 'off'}
              value={guest.lastName}
              onChange={(value) => set(i, 'lastName', value)}
              error={errors[guestFieldId(i, 'lastName')]}
            />
          </div>
        </FieldSet>
      ))}
    </FieldGroup>
  )
}

interface ContactProps extends Pick<BookingFormValues, 'email' | 'phone'> {
  onChange: (change: Partial<Pick<BookingFormValues, 'email' | 'phone'>>) => void
  errors: FormErrors
}

export function ContactFields({ email, phone, onChange, errors }: ContactProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(value) => onChange({ email: value })}
        error={errors.email}
      />
      <TextField
        id="phone"
        label="Телефон"
        type="tel"
        autoComplete="tel"
        placeholder="+7 900 000-00-00"
        value={phone}
        onChange={(value) => onChange({ phone: value })}
        error={errors.phone}
      />
    </div>
  )
}

interface RequestsProps {
  value: string
  onChange: (value: string) => void
  error?: string
}

export function RequestsField({ value, onChange, error }: RequestsProps) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor="requests">Пожелания к размещению</FieldLabel>
      <Textarea
        id="requests"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'requests-error' : 'requests-hint'}
      />
      {error ? (
        <FieldError id="requests-error">{error}</FieldError>
      ) : (
        <FieldDescription id="requests-hint">
          Необязательно, до {MAX_REQUESTS_LENGTH} символов. Отель постарается учесть, но не гарантирует.
        </FieldDescription>
      )}
    </Field>
  )
}
