import { useId, useState, type ReactElement } from 'react'
import { ChevronDown, Minus, Plus, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { countRu, guestsLabel } from '../../lib/format'
import { GUEST_LIMITS, type Guests } from '../../lib/search'
import { fieldBox } from './fieldBox'

interface Props {
  value: Guests
  error?: string
  /** A button of the caller's opens the picker instead of the field; it keeps the field's name. */
  trigger?: ReactElement
  onChange: (value: Guests) => void
}

const rows: { key: keyof Guests; title: string; hint: string; forms: [string, string, string] }[] = [
  { key: 'adults', title: 'Взрослые', hint: 'от 18 лет', forms: ['взрослый', 'взрослых', 'взрослых'] },
  { key: 'children', title: 'Дети', hint: 'до 17 лет', forms: ['ребёнок', 'ребёнка', 'детей'] },
  { key: 'rooms', title: 'Номера', hint: 'не больше, чем взрослых', forms: ['номер', 'номера', 'номеров'] },
]

export function GuestsField({ value, error, trigger, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const errorId = useId()

  const max = (key: keyof Guests) =>
    key === 'rooms' ? Math.min(GUEST_LIMITS.rooms.max, value.adults) : GUEST_LIMITS[key].max

  const change = (key: keyof Guests, delta: number) => {
    const next = { ...value, [key]: value[key] + delta }
    next.rooms = Math.min(next.rooms, next.adults)
    onChange(next)
  }

  const name = `Гости: ${guestsLabel(value)}${value.rooms === 1 ? ', 1 номер' : ''}`
  const describedBy = error ? errorId : undefined

  return (
    <div className="relative min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        {trigger ? (
          <PopoverTrigger render={trigger} aria-label={name} aria-describedby={describedBy} />
        ) : (
          <PopoverTrigger
            className={`group ${fieldBox(Boolean(error))}`}
            aria-label={name}
            aria-describedby={describedBy}
          >
            <User className="shrink-0 text-brand-foreground" size={22} strokeWidth={1.8} aria-hidden />
            <span
              className="truncate text-[clamp(13px,3.55vw,18px)] max-xs:text-sm/[normal]"
              title={guestsLabel(value)}
            >
              {guestsLabel(value)}
            </span>
            <ChevronDown
              // The glyph has built-in side bearings; -mr-1 pulls it towards the edge.
              className={`-mr-1 ml-auto flex-none text-brand-foreground transition-[rotate] duration-200 ease-in-out group-data-popup-open:rotate-180`}
              size={22}
              aria-hidden
            />
          </PopoverTrigger>
        )}

        <PopoverContent
          align="end"
          sideOffset={8}
          // Stays under the field and lets the page scroll, as it did before the popover moved to Base UI.
          collisionAvoidance={{ side: 'none' }}
          aria-label="Гости и номера"
          className={`m-0 w-[min(310px,calc(100vw-2*var(--page-x)-8px))] p-3 animate-in fade-in slide-in-from-top-1 animation-duration-160 ease-out shadow-(--shadow-popover)`}
        >
          {rows.map((row) => (
            <div className="flex items-center justify-between gap-3 px-1 py-2" key={row.key}>
              <span>
                <span className="block font-semibold">{row.title}</span>
                {/* A step below the other hints: "не больше, чем взрослых" must stay on one line on phones. */}
                <span className="block text-xs text-muted-foreground">{row.hint}</span>
              </span>
              <span className="flex flex-none items-center gap-1.5">
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
                  className="min-w-6 text-center font-semibold"
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
      <FieldError className="mx-1 mt-1.5 leading-[1.35]" id={errorId} role={undefined}>
        {error}
      </FieldError>
    </div>
  )
}
