'use client'

import { useState, type FormEvent } from 'react'
import { ContactFields, GuestsFields, RequestsField } from '@/components/BookingFields/TravelerFields'
import { Button } from '@/components/ui/button'
import { FieldLegend, FieldSet } from '@/components/ui/field'
import { validateTravelerDetails, type FormErrors } from '@/lib/booking'
import { focusField } from '@/lib/focusField'
import { saveBooking, type Booking } from '@/lib/storage'

interface Props {
  booking: Booking
  onSaved: () => void
  onCancel: () => void
}

/** Guests, contacts and requests of a booking, with the checks of the checkout. */
export function EditForm({ booking, onSaved, onCancel }: Props) {
  const [roomGuests, setRoomGuests] = useState(booking.roomGuests)
  const [contact, setContact] = useState(booking.contact)
  const [requests, setRequests] = useState(booking.requests)
  const [errors, setErrors] = useState<FormErrors>({})

  function submit(event: FormEvent) {
    event.preventDefault()
    const found = validateTravelerDetails({ roomGuests, ...contact, requests })
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) {
      focusField(first)
      return
    }
    saveBooking({
      ...booking,
      roomGuests: roomGuests.map(({ firstName, lastName }) => ({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      })),
      contact: { email: contact.email.trim(), phone: contact.phone.trim() },
      requests: requests.trim(),
    })
    onSaved()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6 rounded-lg border border-border bg-card p-4">
      <FieldSet>
        <FieldLegend>Гости</FieldLegend>
        <GuestsFields roomGuests={roomGuests} onChange={setRoomGuests} errors={errors} />
      </FieldSet>
      <FieldSet>
        <FieldLegend>Контакты</FieldLegend>
        <ContactFields
          email={contact.email}
          phone={contact.phone}
          onChange={(change) => setContact((current) => ({ ...current, ...change }))}
          errors={errors}
        />
      </FieldSet>
      <FieldSet>
        <FieldLegend>Пожелания</FieldLegend>
        <RequestsField value={requests} onChange={setRequests} error={errors.requests} />
      </FieldSet>
      <div className="flex flex-wrap gap-3">
        <Button type="submit">Сохранить</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </form>
  )
}
