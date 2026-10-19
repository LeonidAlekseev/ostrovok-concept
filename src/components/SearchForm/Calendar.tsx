import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addDays, formatLongDate, fromIso, monthGrid, monthTitle, toIso, type IsoDate } from '../../lib/dates'
import styles from './SearchForm.module.css'

interface Props {
  start: IsoDate
  end: IsoDate | null
  min: IsoDate
  max?: IsoDate
  onPick: (day: IsoDate) => void
}

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const monthKey = (iso: IsoDate) => {
  const d = fromIso(iso)
  return d.getFullYear() * 12 + d.getMonth()
}

/** Two-month range calendar (one month on small screens) with roving-focus keyboard navigation. */
export function Calendar({ start, end, min, max, onPick }: Props) {
  // Roving focus starts on the first selectable day when `start` is before `min` (e.g. a past check-in).
  const first = start < min ? min : start
  const [view, setView] = useState(() => monthKey(first))
  const [focused, setFocused] = useState(first)
  const [hover, setHover] = useState<IsoDate | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const moveFocus = useRef(true)

  useEffect(() => {
    if (!moveFocus.current) return
    moveFocus.current = false
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus()
  }, [focused, view])

  const isDisabled = (iso: IsoDate) => iso < min || (max !== undefined && iso > max)
  const rangeEnd = end ?? (hover && hover > start ? hover : null)

  const onKeyDown = (event: KeyboardEvent) => {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      PageUp: -30,
      PageDown: 30,
    }
    const step = steps[event.key]
    if (step === undefined) return
    event.preventDefault()
    const next = addDays(focused, step)
    if (next < min) return
    // Two months are visible from --breakpoint-md up; the second one is hidden by CSS below it.
    const visible = window.matchMedia('(min-width: 768px)').matches ? 2 : 1
    const key = monthKey(next)
    if (key < view) setView(key)
    else if (key >= view + visible) setView(key - visible + 1)
    moveFocus.current = true
    setFocused(next)
  }

  const shiftView = (delta: number) => {
    const next = view + delta
    setView(next)
    const first = toIso(new Date(Math.floor(next / 12), next % 12, 1))
    setFocused(first < min ? min : first)
  }

  return (
    <div className={styles.calendar}>
      <div className={styles.calendarNav}>
        <Button
          variant="ghost"
          size="icon-sm"
          className={styles.calendarArrow}
          aria-label="Предыдущий месяц"
          disabled={view <= monthKey(min)}
          onClick={() => shiftView(-1)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className={styles.calendarArrow}
          aria-label="Следующий месяц"
          onClick={() => shiftView(1)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
      <div className={styles.months} ref={gridRef} onKeyDown={onKeyDown} onPointerLeave={() => setHover(null)}>
        {[view, view + 1].map((key, index) => {
          const year = Math.floor(key / 12)
          const month = key % 12
          return (
            <div key={key} className={`${styles.month} ${index === 1 ? styles.monthSecond : ''}`}>
              <p className="m-0 pt-2.5 pb-2 text-center text-base font-[650] first-letter:uppercase">
                {monthTitle.format(new Date(year, month, 1))}
              </p>
              <div className={styles.weekdays} aria-hidden>
                {weekdays.map((w) => (
                  <span className="py-1 text-center text-xs text-muted-foreground" key={w}>
                    {w}
                  </span>
                ))}
              </div>
              <div className={styles.days} role="group" aria-label={monthTitle.format(new Date(year, month, 1))}>
                {monthGrid(year, month).map((iso, i) =>
                  iso === null ? (
                    <span key={`pad-${i}`} />
                  ) : (
                    <button
                      key={iso}
                      type="button"
                      data-date={iso}
                      // Selected edges are aria-pressed; the days between them are the range.
                      className={`h-10 border-0 p-0 text-sm enabled:hover:bg-secondary disabled:text-(--decor-disabled) aria-pressed:bg-primary aria-pressed:font-semibold aria-pressed:text-primary-foreground aria-pressed:enabled:hover:bg-primary ${
                        rangeEnd && iso > start && iso < rangeEnd ? 'rounded-none bg-secondary' : 'rounded-md bg-transparent'
                      }`}
                      tabIndex={iso === focused ? 0 : -1}
                      disabled={isDisabled(iso)}
                      aria-pressed={iso === start || iso === end}
                      aria-label={formatLongDate(iso)}
                      onPointerEnter={() => setHover(iso)}
                      onFocus={() => setFocused(iso)}
                      onClick={() => onPick(iso)}
                    >
                      {fromIso(iso).getDate()}
                    </button>
                  ),
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
