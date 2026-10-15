import { useRef, type FormEvent, type RefObject } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import type { HotelSearch } from '../../hooks/useHotelSearch'
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
    <form className={styles.card} ref={formRef} onSubmit={onSubmit} noValidate aria-label="Поиск отелей">
      <div className={styles.grid}>
        <DestinationField
          value={query.destination}
          error={errors.destination}
          inputRef={destinationRef}
          onChange={setDestination}
        />
        <DateField checkIn={query.checkIn} checkOut={query.checkOut} error={errors.dates} onChange={setDates} />
        <GuestsField value={query.guests} error={errors.guests} onChange={setGuests} />
        <button ref={submitRef} className={`${styles.submit} ${styles.areaSubmit}`} type="submit" aria-busy={loading}>
          Найти отель
          {loading ? (
            <LoaderCircle className={styles.spin} size={24} aria-hidden />
          ) : (
            <ArrowRight size={26} strokeWidth={2} aria-hidden />
          )}
        </button>
      </div>
      <SearchResults status={status} />
    </form>
  )
}
