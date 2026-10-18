import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { MapPin, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { scenarios } from '@/data/destinations'
import { useDismiss } from '@/hooks/useDismiss'
import { formatPrice } from '../../lib/format'
import { suggestDestinations } from '../../lib/search'
import styles from './SearchForm.module.css'

interface Props {
  value: string
  error?: string
  inputRef: RefObject<HTMLInputElement | null>
  onChange: (value: string) => void
}

interface Option {
  id: string
  label: string
  hint: string
}

export function DestinationField({ value, error, inputRef, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const errorId = useId()
  const close = useCallback(() => {
    setOpen(false)
    setActive(-1)
  }, [])
  useDismiss(rootRef, open, close)

  const options = useMemo<Option[]>(() => {
    const scenario = scenarios.find((s) => s.title.toLowerCase() === value.trim().toLowerCase())
    const places = suggestDestinations(value).map((d) => ({
      id: d.id,
      label: d.name,
      hint: `${d.country} · от ${formatPrice(d.priceFrom)}`,
    }))
    return scenario
      ? [{ id: `scenario-${scenario.id}`, label: scenario.title, hint: 'Все подходящие направления' }, ...places]
      : places
  }, [value])

  const choose = (option: Option) => {
    onChange(option.label)
    close()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (options.length ? (i + step + options.length) % options.length : -1))
    } else if (event.key === 'Enter' && open && active >= 0 && options[active]) {
      event.preventDefault()
      choose(options[active])
    } else if (event.key === 'Escape' && open) {
      event.stopPropagation()
      close()
    }
  }

  const showList = open && options.length > 0

  return (
    <div className={`${styles.fieldWrap} ${styles.areaDestination}`} ref={rootRef}>
      <div className={styles.fieldRow}>
        <label className={`${styles.field} ${error ? styles.fieldInvalid : ''}`}>
          <MapPin className={styles.fieldIcon} size={22} strokeWidth={1.8} aria-hidden />
          <span className="visually-hidden">Направление</span>
          <input
            ref={inputRef}
            // Input's text styles; the bordered box is the shared .field, moved with the combobox later.
            className="h-full min-w-0 flex-1 bg-transparent pr-14 text-base outline-none placeholder:text-muted-foreground sm:text-lg"
            type="text"
            role="combobox"
            placeholder="Куда отправимся?"
            autoComplete="off"
            spellCheck={false}
            value={value}
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              onChange(e.target.value)
              setOpen(true)
              setActive(-1)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
        </label>
        <span className={styles.divider} aria-hidden />
        <Button
          variant="ghost"
          size="icon-sm"
          className={`${styles.clear} text-muted-foreground hover:text-foreground`}
          aria-label="Очистить направление"
          onClick={() => {
            // Clearing ends the input: the suggestions fold and the keyboard goes away.
            onChange('')
            close()
            inputRef.current?.blur()
          }}
        >
          <X className="size-5.5" strokeWidth={1.8} aria-hidden />
        </Button>
      </div>

      {showList && (
        <ul
          className={`${styles.popover} ${styles.suggestions}`}
          id={listId}
          role="listbox"
          aria-label="Подходящие направления"
        >
          {options.map((option, i) => (
            <li
              key={option.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={styles.option}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(option)}
              onPointerMove={() => setActive(i)}
            >
              <MapPin className={styles.optionIcon} size={18} aria-hidden />
              <span>
                <span className={styles.optionLabel}>{option.label}</span>
                <span className={styles.optionHint}>{option.hint}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {/* Not an alert: the error is announced through aria-describedby when focus moves to the field. */}
      <FieldError className={styles.error} id={errorId} role={undefined}>
        {error}
      </FieldError>
    </div>
  )
}
