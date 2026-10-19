import { useId, useState } from 'react'
import { ChevronDown, Minus, Plus, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { countRu, guestsLabel } from '../../lib/format'
import { GUEST_LIMITS, type Guests } from '../../lib/search'
import styles from './SearchForm.module.css'

interface Props {
  value: Guests
  error?: string
  onChange: (value: Guests) => void
}

const rows: { key: keyof Guests; title: string; hint: string; forms: [string, string, string] }[] = [
  { key: 'adults', title: 'Взрослые', hint: 'от 18 лет', forms: ['взрослый', 'взрослых', 'взрослых'] },
  { key: 'children', title: 'Дети', hint: 'до 17 лет', forms: ['ребёнок', 'ребёнка', 'детей'] },
  { key: 'rooms', title: 'Номера', hint: 'не больше, чем взрослых', forms: ['номер', 'номера', 'номеров'] },
]

export function GuestsField({ value, error, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const errorId = useId()

  const max = (key: keyof Guests) =>
    key === 'rooms' ? Math.min(GUEST_LIMITS.rooms.max, value.adults) : GUEST_LIMITS[key].max

  const change = (key: keyof Guests, delta: number) => {
    const next = { ...value, [key]: value[key] + delta }
    next.rooms = Math.min(next.rooms, next.adults)
    onChange(next)
  }

  return (
    <div className={`${styles.fieldWrap} ${styles.areaGuests}`}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={`${styles.field} ${styles.fieldButton} ${error ? styles.fieldInvalid : ''}`}
          aria-label={`Гости: ${guestsLabel(value)}${value.rooms === 1 ? ', 1 номер' : ''}`}
          aria-describedby={error ? errorId : undefined}
        >
          <User className={styles.fieldIcon} size={22} strokeWidth={1.8} aria-hidden />
          <span className={styles.value} title={guestsLabel(value)}>
            {guestsLabel(value)}
          </span>
          <ChevronDown className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} size={22} aria-hidden />
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={8}
          // Stays under the field and lets the page scroll, as it did before the popover moved to Base UI.
          collisionAvoidance={{ side: 'none' }}
          aria-label="Гости и номера"
          className={`${styles.popoverSurface} ${styles.guestsPopover}`}
        >
          {rows.map((row) => (
            <div className={styles.stepperRow} key={row.key}>
              <span>
                <span className={styles.stepperTitle}>{row.title}</span>
                <span className={styles.stepperHint}>{row.hint}</span>
              </span>
              <span className={styles.stepper}>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`${row.title}: уменьшить`}
                  disabled={value[row.key] <= GUEST_LIMITS[row.key].min}
                  onClick={() => change(row.key, -1)}
                >
                  <Minus className="size-4.5" aria-hidden />
                </Button>
                <output
                  className={styles.stepperValue}
                  aria-live="polite"
                  aria-label={countRu(value[row.key], row.forms)}
                >
                  {value[row.key]}
                </output>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`${row.title}: увеличить`}
                  disabled={value[row.key] >= max(row.key)}
                  onClick={() => change(row.key, 1)}
                >
                  <Plus className="size-4.5" aria-hidden />
                </Button>
              </span>
            </div>
          ))}
          <Button className="mt-2 w-full" onClick={() => setOpen(false)}>
            Готово
          </Button>
        </PopoverContent>
      </Popover>
      {/* Not an alert: the error is announced through aria-describedby when focus moves to the field. */}
      <FieldError className={styles.error} id={errorId} role={undefined}>
        {error}
      </FieldError>
    </div>
  )
}
