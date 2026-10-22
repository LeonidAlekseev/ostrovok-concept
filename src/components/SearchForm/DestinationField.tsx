import { useId, useMemo, useRef, type RefObject } from 'react'
import { MapPin, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { loadDestinations } from '../../lib/catalogSource'
import { formatPrice } from '../../lib/format'
import { findScenario, suggestDestinations } from '../../lib/search'
import { fieldBox } from './fieldBox'

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
  const errorId = useId()
  const fieldRef = useRef<HTMLDivElement>(null)

  // The suggestions are computed from the typed text here, so Base UI must not filter them again.
  const options = useMemo<Option[]>(() => {
    const scenario = findScenario(value)
    const places = suggestDestinations(value, loadDestinations()).map((d) => ({
      id: d.id,
      label: d.name,
      hint: `${d.country} · ${formatPrice(d.priceFrom)}`,
    }))
    return scenario
      ? [{ id: `scenario-${scenario.id}`, label: scenario.title, hint: 'Все подходящие направления' }, ...places]
      : places
  }, [value])

  return (
    <div className="relative col-span-full min-w-0 lg:col-auto" ref={fieldRef}>
      {/* The text is the destination: a picked suggestion fills it in. */}
      <Combobox
        items={options}
        filter={null}
        inputValue={value}
        itemToStringLabel={(option: Option) => option.label}
        // Only typing and picking change the destination. Base UI also rewrites the text to the selected label
        // when the list closes (blur, Escape, none); the typed text stays, and the clear button is the only way to empty it.
        onInputValueChange={(text, details) => {
          if (details.reason === 'input-change' || details.reason === 'item-press') {
            onChange(text)
          }
        }}
        openOnInputClick
      >
        <ComboboxInputGroup className="relative">
          <label className={fieldBox(Boolean(error))}>
            <MapPin className="shrink-0 text-brand-foreground" size={22} strokeWidth={1.8} aria-hidden />
            <span className="sr-only">Направление</span>
            <ComboboxInput
              ref={inputRef}
              // Input's text styles; the bordered box is the label's fieldBox.
              className="h-full min-w-0 flex-1 bg-transparent pr-14 text-base outline-none placeholder:text-muted-foreground sm:text-lg"
              placeholder="Куда отправимся?"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          <span className="absolute top-[22%] right-[clamp(48px,13vw,58px)] bottom-[22%] w-px bg-border" aria-hidden />
          <Button
            variant="ghost"
            size="icon-sm"
            // Centred by auto margins: a transform would fight the button's pressed shift.
            className="absolute inset-y-0 right-[clamp(6px,2vw,10px)] my-auto text-muted-foreground hover:text-foreground"
            aria-label="Очистить направление"
            onClick={() => {
              // Clearing ends the input: the suggestions fold and the keyboard goes away.
              onChange('')
              inputRef.current?.blur()
            }}
          >
            <X className="size-5.5" strokeWidth={1.8} aria-hidden />
          </Button>
        </ComboboxInputGroup>

        <ComboboxContent
          container={fieldRef}
          align="start"
          sideOffset={8}
          // Stays under the field and lets the page scroll, as it did before the list moved to Base UI.
          collisionAvoidance={{ side: 'none' }}
          className={`m-0 max-h-80 w-(--anchor-width) overflow-y-auto animate-in fade-in slide-in-from-top-1 animation-duration-160 ease-out rounded-xl bg-card p-2 shadow-(--shadow-popover)`}
        >
          <ComboboxList aria-label="Подходящие направления">
            {options.map((option) => (
              <ComboboxItem
                key={option.id}
                value={option}
                className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 data-highlighted:bg-muted"
              >
                <MapPin className="shrink-0 text-primary" size={18} aria-hidden />
                <span>
                  <span className="block font-semibold">{option.label}</span>
                  <span className="block text-sm font-normal text-muted-foreground">{option.hint}</span>
                </span>
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {/* Not an alert: the error is announced through aria-describedby when focus moves to the field. */}
      <FieldError className="mx-1 mt-1.5 leading-[1.35]" id={errorId} role={undefined}>
        {error}
      </FieldError>
    </div>
  )
}
