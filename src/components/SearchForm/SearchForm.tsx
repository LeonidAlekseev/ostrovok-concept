import { useRef, type FormEvent, type RefObject } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { HotelSearch } from '@/hooks/useHotelSearch'
import { DateField } from './DateField'
import { DestinationField } from './DestinationField'
import { GuestsField } from './GuestsField'
import { SearchResults } from './SearchResults'
import styles from './SearchForm.module.css'

interface Props {
  search: HotelSearch
  destinationRef: RefObject<HTMLInputElement | null>
  submitRef: RefObject<HTMLButtonElement | null>
}

export function SearchForm({ search, destinationRef, submitRef }: Props) {
  const { query, errors, status, setDestination, setDates, setGuests, submit } = search
  const formRef = useRef<HTMLFormElement>(null)
  const loading = status.state === 'loading'

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const found = await submit()
    if (found.destination) destinationRef.current?.focus()
    else if (found.dates || found.guests) formRef.current?.querySelector<HTMLElement>('[aria-describedby]')?.focus()
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-label="Поиск отелей">
      <div className={styles.grid}>
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
          className={`${styles.areaSubmit} h-[clamp(50px,12.8vw,56px)] gap-3 lg:h-15`}
          type="submit"
          aria-busy={loading}
        >
          Найти отель
          {loading ? (
            <LoaderCircle className="size-6 animate-[spin_0.9s_linear_infinite]" aria-hidden />
          ) : (
            <ArrowRight className="size-6.5" strokeWidth={2} aria-hidden />
          )}
        </Button>
      </div>
      <SearchResults status={status} />
    </form>
  )
}
