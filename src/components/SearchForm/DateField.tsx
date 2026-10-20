import { useId, useState, type ReactElement, type Ref } from 'react'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { addDays, formatDateRange, formatLongDate, nightsBetween, todayIso, type IsoDate } from '../../lib/dates'
import { countRu } from '../../lib/format'
import { MAX_NIGHTS } from '../../lib/search'
import { Calendar } from './Calendar'
import { fieldBox } from './fieldBox'

interface Props {
  checkIn: IsoDate
  checkOut: IsoDate
  error?: string
  /** One date instead of a stay: a pick sets `checkIn` and `checkOut` alike and closes the calendar. */
  single?: boolean
  /** Id of the text that explains the field, read after its label. */
  describedBy?: string
  triggerRef?: Ref<HTMLButtonElement>
  /** A button of the caller's, e.g. "Изменить", opens the calendar instead of the field; it names itself. */
  trigger?: ReactElement
  onChange: (checkIn: IsoDate, checkOut: IsoDate) => void
}

const nightForms: [string, string, string] = ['ночь', 'ночи', 'ночей']

export function DateField({ checkIn, checkOut, error, single, describedBy, triggerRef, trigger, onChange }: Props) {
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
    if (single) {
      onChange(day, day)
      close()
      return
    }
    if (draftStart === null || day <= draftStart) {
      setDraftStart(day)
      return
    }
    onChange(draftStart, day)
    close()
  }

  const today = todayIso()
  const hasDates = Boolean(checkIn && checkOut)
  const label = hasDates ? (single ? formatLongDate(checkIn) : formatDateRange(checkIn, checkOut)) : ''
  const nights = hasDates ? nightsBetween(checkIn, checkOut) : 0

  return (
    <div className="relative min-w-0">
      <Popover open={open} onOpenChange={onOpenChange}>
        {trigger ? (
          <PopoverTrigger render={trigger} ref={triggerRef} />
        ) : (
          <PopoverTrigger
            className={`${fieldBox(Boolean(error))}`}
            ref={triggerRef}
            aria-label={single ? `Дата заезда: ${label}` : `Даты поездки: ${label}, ${countRu(nights, nightForms)}`}
            aria-describedby={[describedBy, error && errorId].filter(Boolean).join(' ') || undefined}
          >
            <CalendarDays className="shrink-0 text-brand-foreground" size={22} strokeWidth={1.8} aria-hidden />
            <span className="truncate text-[clamp(13px,3.55vw,18px)] max-xs:text-sm/[normal]" title={label}>
              {label}
            </span>
          </PopoverTrigger>
        )}

        <PopoverContent
          // A caller's button sits at the end of its row: the calendar opens towards the start.
          align={trigger ? 'end' : 'start'}
          sideOffset={8}
          // Stays under the field and lets the page scroll, as it did before the popover moved to Base UI.
          collisionAvoidance={{ side: 'none' }}
          // The calendar focuses its own selected day; the popover must not move focus to the month arrow.
          initialFocus={false}
          aria-label={single ? 'Выбор даты заезда' : 'Выбор дат заезда и выезда'}
          className={`m-0 w-[min(330px,calc(100vw-2*var(--page-x)-8px))] p-2 ${single ? '' : 'md:w-155'} animate-in fade-in slide-in-from-top-1 animation-duration-160 ease-out shadow-(--shadow-popover)`}
        >
          <p className="mx-2 mt-1 mb-0 text-sm text-muted-foreground" aria-live="polite">
            {draftStart ? 'Выберите дату выезда' : 'Выберите дату заезда'}
          </p>
          <Calendar
            start={draftStart ?? checkIn}
            end={draftStart ? null : single ? checkIn : checkOut}
            min={today}
            max={draftStart ? addDays(draftStart, MAX_NIGHTS) : undefined}
            single={single}
            onPick={pick}
          />
          <div className="flex items-center justify-between gap-3 border-t border-border px-2 pt-2.5 pb-1">
            <span className="text-sm font-[550]">
              {draftStart
                ? formatDateRange(draftStart, null)
                : single
                  ? label
                  : `${label} · ${countRu(nights, nightForms)}`}
            </span>
            <Button onClick={close}>{draftStart ? 'Отмена' : 'Готово'}</Button>
          </div>
        </PopoverContent>
      </Popover>
      {/* Not an alert: the error is announced through aria-describedby when focus moves to the field. */}
      <FieldError className="mx-1 mt-1.5 leading-[1.35]" id={errorId} role={undefined}>
        {error}
      </FieldError>
    </div>
  )
}
