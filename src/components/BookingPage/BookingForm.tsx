'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Info } from 'lucide-react'
import { CardFields } from '@/components/BookingFields/CardFields'
import { ContactFields, GuestsFields, RequestsField } from '@/components/BookingFields/TravelerFields'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLegend, FieldSet } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { useBookings, useSession } from '@/hooks/useStore'
import {
  createBooking,
  EMPTY_CARD,
  newBookingId,
  validateBookingForm,
  type BookingFormValues,
  type FormErrors,
} from '@/lib/booking'
import { todayIso } from '@/lib/dates'
import type { Offer } from '@/lib/offer'
import { focusField } from '@/lib/focusField'
import { saveBooking } from '@/lib/storage'

/** The demo "processing" pause before the booking is made. */
export const PROCESSING_MS = 1000

/** Splits the session name into first and last name; "Анна Петрова" → Анна / Петрова. */
const splitName = (name: string) => {
  const [first = '', ...rest] = name.trim().split(/\s+/)
  return { firstName: first, lastName: rest.join(' ') }
}

export function BookingForm({ offer }: { offer: Offer }) {
  const router = useRouter()
  const session = useSession()
  const bookings = useBookings()
  const rooms = offer.guests.rooms
  const payNow = offer.rate.payment === 'now'

  // What the user has typed; fields not typed in yet show the session's name and email.
  const [typed, setTyped] = useState<Partial<BookingFormValues>>({})
  const [errors, setErrors] = useState<FormErrors>({})
  const [processing, setProcessing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const sessionName = session ? splitName(session.name) : { firstName: '', lastName: '' }
  const values: BookingFormValues = {
    roomGuests:
      typed.roomGuests ??
      Array.from({ length: rooms }, (_, i) => (i === 0 ? sessionName : { firstName: '', lastName: '' })),
    email: typed.email ?? session?.email ?? '',
    phone: typed.phone ?? '',
    requests: typed.requests ?? '',
    card: typed.card ?? EMPTY_CARD,
    agreed: typed.agreed ?? false,
  }
  const change = (next: Partial<BookingFormValues>) => setTyped((current) => ({ ...current, ...next }))

  function submit(event: FormEvent) {
    event.preventDefault()
    if (processing) return
    const found = validateBookingForm(values, offer.rate.payment, todayIso())
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) {
      focusField(first)
      return
    }
    setProcessing(true)
    timer.current = setTimeout(() => {
      let id = newBookingId()
      while (bookings.some((b) => b.id === id)) id = newBookingId()
      saveBooking(createBooking(offer, values, id, new Date(), todayIso()))
      router.replace(`/trips?new=${id}`)
    }, PROCESSING_MS)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      <FieldSet>
        <FieldLegend>Гости</FieldLegend>
        <GuestsFields
          roomGuests={values.roomGuests}
          onChange={(roomGuests) => change({ roomGuests })}
          errors={errors}
        />
      </FieldSet>
      <FieldSet>
        <FieldLegend>Контакты</FieldLegend>
        <ContactFields email={values.email} phone={values.phone} onChange={change} errors={errors} />
      </FieldSet>
      <FieldSet>
        <FieldLegend>Пожелания</FieldLegend>
        <RequestsField value={values.requests} onChange={(requests) => change({ requests })} error={errors.requests} />
      </FieldSet>
      <FieldSet>
        <FieldLegend>Оплата</FieldLegend>
        <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Это демо: деньги не списываются, данные карты никуда не отправляются и не сохраняются.
            {payNow && ' Для проверки подойдёт тестовая карта 4242 4242 4242 4242.'}
          </span>
        </p>
        {payNow ? (
          <CardFields card={values.card} onChange={(card) => change({ card })} errors={errors} />
        ) : (
          <p className="font-semibold">Оплата в отеле при заселении</p>
        )}
      </FieldSet>
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
            </Link>{' '}
            и{' '}
            <Link className="underline" href="/legal/privacy" target="_blank">
              политику конфиденциальности
            </Link>
          </Label>
        </div>
        {errors.agreed && <FieldError id="agreed-error">{errors.agreed}</FieldError>}
      </Field>
      <Button type="submit" size="lg" disabled={processing} className="w-full sm:w-fit">
        {processing ? 'Обрабатываем…' : 'Забронировать'}
      </Button>
    </form>
  )
}
