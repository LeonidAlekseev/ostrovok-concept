import { useRef, type FormEvent, type RefObject } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { HotelSearch } from '@/hooks/useHotelSearch'
import { DateField } from './DateField'
import { DestinationField } from './DestinationField'
import { GuestsField } from './GuestsField'

interface Props {
  search: HotelSearch
  destinationRef: RefObject<HTMLInputElement | null>
  submitRef: RefObject<HTMLButtonElement | null>
}

export function SearchForm({ search, destinationRef, submitRef }: Props) {
  const { query, errors, pending, setDestination, setDates, setGuests, submit } = search
  const formRef = useRef<HTMLFormElement>(null)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const found = submit()
    if (found.destination) destinationRef.current?.focus()
    else if (found.dates || found.guests) formRef.current?.querySelector<HTMLElement>('[aria-describedby]')?.focus()
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-label="Поиск отелей">
      {/* Phones: destination and submit take the full row, dates and guests share one (stacked below xs). */}
      <div className="grid grid-cols-[minmax(0,1.42fr)_minmax(0,1fr)] gap-[clamp(8px,2.4vw,12px)] max-xs:grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1.2fr)_minmax(0,0.95fr)_auto]">
        <DestinationField
          value={query.destination}
          error={errors.destination}
          inputRef={destinationRef}
          onChange={setDestination}
        />
        <DateField checkIn={query.checkIn} checkOut={query.checkOut} error={errors.dates} onChange={setDates} />
        <GuestsField value={query.guests} error={errors.guests} onChange={setGuests} />
        <Button
          ref={submitRef}
          size="lg"
          className="col-span-full h-[clamp(50px,12.8vw,56px)] gap-3 lg:col-auto lg:h-15"
          type="submit"
          aria-busy={pending}
        >
          Найти отель
          {pending ? (
            <LoaderCircle className="size-6 animate-[spin_0.9s_linear_infinite]" aria-hidden />
          ) : (
            <ArrowRight className="size-6.5" strokeWidth={2} aria-hidden />
          )}
        </Button>
      </div>
    </form>
  )
}
