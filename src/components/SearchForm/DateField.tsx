import { useCallback, useId, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { useDismiss } from '@/hooks/useDismiss'
import { addDays, formatDateRange, nightsBetween, todayIso, type IsoDate } from '../../lib/dates'
import { countRu } from '../../lib/format'
import { MAX_NIGHTS } from '../../lib/search'
import { Calendar } from './Calendar'
import styles from './SearchForm.module.css'

interface Props {
  checkIn: IsoDate
  checkOut: IsoDate
  error?: string
  onChange: (checkIn: IsoDate, checkOut: IsoDate) => void
}

const nightForms: [string, string, string] = ['ночь', 'ночи', 'ночей']

export function DateField({ checkIn, checkOut, error, onChange }: Props) {
  const [open, setOpen] = useState(false)
  // Check-in picked, check-out pending. Discarded if the popover closes midway.
  const [draftStart, setDraftStart] = useState<IsoDate | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverId = useId()
  const errorId = useId()

  const close = useCallback(() => {
    setOpen(false)
    setDraftStart(null)
  }, [])
  useDismiss(rootRef, open, close)

  const pick = (day: IsoDate) => {
    if (draftStart === null || day <= draftStart) {
      setDraftStart(day)
      return
    }
    onChange(draftStart, day)
    close()
    triggerRef.current?.focus()
  }

  const today = todayIso()
  const label = formatDateRange(checkIn, checkOut)
  const nights = nightsBetween(checkIn, checkOut)

  return (
    <div className={`${styles.fieldWrap} ${styles.areaDates}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.field} ${styles.fieldButton} ${error ? styles.fieldInvalid : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-label={`Даты поездки: ${label}, ${countRu(nights, nightForms)}`}
        aria-describedby={error ? errorId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <CalendarDays className={styles.fieldIcon} size={22} strokeWidth={1.8} aria-hidden />
        <span className={styles.value} title={label}>
          {label}
        </span>
      </button>

      {open && (
        <div
          className={`${styles.popover} ${styles.datesPopover}`}
          id={popoverId}
          role="dialog"
          aria-label="Выбор дат заезда и выезда"
        >
          <p className={styles.popoverHint} aria-live="polite">
            {draftStart ? 'Выберите дату выезда' : 'Выберите дату заезда'}
          </p>
          <Calendar
            start={draftStart ?? checkIn}
            end={draftStart ? null : checkOut}
            min={today}
            max={draftStart ? addDays(draftStart, MAX_NIGHTS) : undefined}
            onPick={pick}
          />
          <div className={styles.popoverFooter}>
            <span className={styles.popoverSummary}>
              {draftStart ? formatDateRange(draftStart, null) : `${label} · ${countRu(nights, nightForms)}`}
            </span>
            <Button onClick={close}>{draftStart ? 'Отмена' : 'Готово'}</Button>
          </div>
        </div>
      )}
      {/* Not an alert: the error is announced through aria-describedby when focus moves to the field. */}
      <FieldError className={styles.error} id={errorId} role={undefined}>
        {error}
      </FieldError>
    </div>
  )
}
