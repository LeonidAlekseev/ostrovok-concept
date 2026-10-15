import { useCallback, useId, useRef, useState } from 'react'
import { ChevronDown, Minus, Plus, User } from 'lucide-react'
import { useDismiss } from '../../hooks/useDismiss'
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
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverId = useId()
  const errorId = useId()
  const close = useCallback(() => setOpen(false), [])
  useDismiss(rootRef, open, close)

  const max = (key: keyof Guests) =>
    key === 'rooms' ? Math.min(GUEST_LIMITS.rooms.max, value.adults) : GUEST_LIMITS[key].max

  const change = (key: keyof Guests, delta: number) => {
    const next = { ...value, [key]: value[key] + delta }
    next.rooms = Math.min(next.rooms, next.adults)
    onChange(next)
  }

  return (
    <div className={`${styles.fieldWrap} ${styles.areaGuests}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.field} ${styles.fieldButton} ${error ? styles.fieldInvalid : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-label={`Гости: ${guestsLabel(value)}${value.rooms === 1 ? ', 1 номер' : ''}`}
        aria-describedby={error ? errorId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <User className={styles.fieldIcon} size={22} strokeWidth={1.8} aria-hidden />
        <span className={styles.value} title={guestsLabel(value)}>
          {guestsLabel(value)}
        </span>
        <ChevronDown className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} size={22} aria-hidden />
      </button>

      {open && (
        <div
          className={`${styles.popover} ${styles.guestsPopover}`}
          id={popoverId}
          role="dialog"
          aria-label="Гости и номера"
        >
          {rows.map((row) => (
            <div className={styles.stepperRow} key={row.key}>
              <span>
                <span className={styles.stepperTitle}>{row.title}</span>
                <span className={styles.stepperHint}>{row.hint}</span>
              </span>
              <span className={styles.stepper}>
                <button
                  type="button"
                  className={styles.stepperButton}
                  aria-label={`${row.title}: уменьшить`}
                  disabled={value[row.key] <= GUEST_LIMITS[row.key].min}
                  onClick={() => change(row.key, -1)}
                >
                  <Minus size={18} aria-hidden />
                </button>
                <output
                  className={styles.stepperValue}
                  aria-live="polite"
                  aria-label={countRu(value[row.key], row.forms)}
                >
                  {value[row.key]}
                </output>
                <button
                  type="button"
                  className={styles.stepperButton}
                  aria-label={`${row.title}: увеличить`}
                  disabled={value[row.key] >= max(row.key)}
                  onClick={() => change(row.key, 1)}
                >
                  <Plus size={18} aria-hidden />
                </button>
              </span>
            </div>
          ))}
          <button
            type="button"
            className={`${styles.popoverDone} ${styles.popoverDoneWide}`}
            onClick={() => {
              close()
              triggerRef.current?.focus()
            }}
          >
            Готово
          </button>
        </div>
      )}
      {error && (
        <p className={styles.error} id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
}
