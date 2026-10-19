import { useId, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { addDays, formatDateRange, nightsBetween, todayIso, type IsoDate } from '../../lib/dates'
import { countRu } from '../../lib/format'
import { MAX_NIGHTS } from '../../lib/search'
import { Calendar } from './Calendar'
import { fieldBox } from './fieldBox'
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
  const errorId = useId()

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setDraftStart(null)
  }
  const close = () => onOpenChange(false)

  const pick = (day: IsoDate) => {
    if (draftStart === null || day <= draftStart) {
      setDraftStart(day)
      return
    }
    onChange(draftStart, day)
    close()
  }

  const today = todayIso()
  const hasDates = Boolean(checkIn && checkOut)
  const label = hasDates ? formatDateRange(checkIn, checkOut) : ''
  const nights = hasDates ? nightsBetween(checkIn, checkOut) : 0

  return (
    <div className={`${styles.fieldWrap} ${styles.areaDates}`}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger
          className={`${styles.field} ${fieldBox(Boolean(error))}`}
          aria-label={`Даты поездки: ${label}, ${countRu(nights, nightForms)}`}
          aria-describedby={error ? errorId : undefined}
        >
          <CalendarDays className="shrink-0 text-brand-foreground" size={22} strokeWidth={1.8} aria-hidden />
          <span className={styles.value} title={label}>
            {label}
          </span>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={8}
          // Stays under the field and lets the page scroll, as it did before the popover moved to Base UI.
          collisionAvoidance={{ side: 'none' }}
          // The calendar focuses its own selected day; the popover must not move focus to the month arrow.
          initialFocus={false}
          aria-label="Выбор дат заезда и выезда"
          className={`${styles.popoverSurface} ${styles.datesPopover} m-0 p-2 shadow-(--shadow-popover)`}
        >
          <p className="mx-2 mt-1 mb-0 text-sm text-muted-foreground" aria-live="polite">
            {draftStart ? 'Выберите дату выезда' : 'Выберите дату заезда'}
          </p>
          <Calendar
            start={draftStart ?? checkIn}
            end={draftStart ? null : checkOut}
            min={today}
            max={draftStart ? addDays(draftStart, MAX_NIGHTS) : undefined}
            onPick={pick}
          />
          <div className="flex items-center justify-between gap-3 border-t border-border px-2 pt-2.5 pb-1">
            <span className="text-sm font-[550]">
              {draftStart ? formatDateRange(draftStart, null) : `${label} · ${countRu(nights, nightForms)}`}
            </span>
            <Button onClick={close}>{draftStart ? 'Отмена' : 'Готово'}</Button>
          </div>
        </PopoverContent>
      </Popover>
      {/* Not an alert: the error is announced through aria-describedby when focus moves to the field. */}
      <FieldError className={styles.error} id={errorId} role={undefined}>
        {error}
      </FieldError>
    </div>
  )
}
