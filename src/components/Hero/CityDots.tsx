import { useId, type KeyboardEventHandler, type Ref } from 'react'
import { globeCities, type GlobeCity } from '../../data/globeCities'

const label =
  'pointer-events-none absolute top-0 left-0 z-4 flex w-max flex-col items-center rounded-sm bg-card px-2 py-1 text-xs/[1.25] shadow-(--shadow-soft) translate-x-[calc(var(--x)_*_var(--unit)_-_50%)] translate-y-[calc(var(--y)_*_var(--unit)_-_100%_-_12px)] data-hidden:invisible'

interface LabelProps {
  city: GlobeCity | null
  /** Moved to the dot by the globe's frame loop. */
  labelRef: Ref<HTMLDivElement>
}

/** The name and the country of a city dot. The dots are labels only: the catalogue has hotels in Valencia alone. */
export function CityLabel({ city, labelRef }: LabelProps) {
  return (
    <div ref={labelRef} className={label} data-hidden aria-hidden>
      {city && (
        <>
          <span className="font-semibold text-foreground">{city.name}</span>
          <span className="text-muted-foreground">{city.country}</span>
        </>
      )}
    </div>
  )
}

interface ListProps {
  active: GlobeCity | null
  onActive: (city: GlobeCity | null) => void
  onFocusChange: (focused: boolean) => void
}

/**
 * The dots for the keyboard and screen readers: one tab stop, arrow keys walk the cities, and the
 * label shows the current one on the globe. Visually hidden, so there is nothing extra to paint.
 */
export function CityList({ active, onActive, onFocusChange }: ListProps) {
  const id = useId()
  const index = active ? globeCities.indexOf(active) : -1
  const go = (to: number) => onActive(globeCities[(to + globeCities.length) % globeCities.length])
  const onKeyDown: KeyboardEventHandler = (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]
    if (step !== undefined) go(index + step)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(globeCities.length - 1)
    else if (e.key === 'Escape') onActive(null)
    else return
    e.preventDefault()
  }
  return (
    <ul
      role="listbox"
      tabIndex={0}
      aria-label="Столицы и курорты на глобусе"
      aria-activedescendant={active ? `${id}-${active.id}` : undefined}
      className="sr-only"
      onKeyDown={onKeyDown}
      onFocus={() => {
        onFocusChange(true)
        if (!active) go(0)
      }}
      onBlur={() => {
        onFocusChange(false)
        onActive(null)
      }}
    >
      {globeCities.map((c) => (
        <li key={c.id} id={`${id}-${c.id}`} role="option" aria-selected={c === active}>
          {c.name}, {c.country}
        </li>
      ))}
    </ul>
  )
}
