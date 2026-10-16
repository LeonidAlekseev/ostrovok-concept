import { useId, useRef, type KeyboardEvent, type RefObject } from 'react'
import { Dice5, SlidersHorizontal, Sparkles, type LucideIcon } from 'lucide-react'
import type { Destination } from '../../data/destinations'
import type { HotelSearch } from '../../hooks/useHotelSearch'
import { SearchForm } from '../SearchForm/SearchForm'
import { AssistantSearch } from './AssistantSearch'
import { RandomSearch } from './RandomSearch'
import styles from './SearchPanel.module.css'

export type SearchMode = 'assistant' | 'manual' | 'random'

const modes: { id: SearchMode; label: string; icon: LucideIcon }[] = [
  { id: 'assistant', label: 'Ассистент', icon: Sparkles },
  { id: 'manual', label: 'Вручную', icon: SlidersHorizontal },
  { id: 'random', label: 'Случайность', icon: Dice5 },
]

interface Props {
  mode: SearchMode
  onModeChange: (mode: SearchMode) => void
  search: HotelSearch
  destinationRef: RefObject<HTMLInputElement | null>
  submitRef: RefObject<HTMLButtonElement | null>
  /** Shows a destination on the globe without leaving the current mode. */
  onPreview: (destination: Destination) => void
  /** Opens the assistant's choice in the manual form and searches. */
  onChoose: HotelSearch['searchFor']
}

export function SearchPanel({ mode, onModeChange, search, destinationRef, submitRef, onPreview, onChoose }: Props) {
  const id = useId()
  const tabRefs = useRef(new Map<SearchMode, HTMLButtonElement>())

  // Arrow keys move between tabs (WAI-ARIA tabs pattern with automatic activation).
  const onKeyDown = (event: KeyboardEvent) => {
    const index = modes.findIndex((m) => m.id === mode)
    const target = {
      ArrowRight: (index + 1) % modes.length,
      ArrowLeft: (index - 1 + modes.length) % modes.length,
      Home: 0,
      End: modes.length - 1,
    }[event.key]
    if (target === undefined) return
    event.preventDefault()
    onModeChange(modes[target].id)
    tabRefs.current.get(modes[target].id)?.focus()
  }

  return (
    <div className={styles.panel}>
      <div className={styles.tabs} role="tablist" aria-label="Способ поиска" onKeyDown={onKeyDown}>
        {modes.map(({ id: modeId, label, icon: Icon }) => (
          <button
            key={modeId}
            ref={(el) => {
              if (el) tabRefs.current.set(modeId, el)
              else tabRefs.current.delete(modeId)
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${modeId}`}
            aria-controls={`${id}-panel-${modeId}`}
            aria-selected={mode === modeId}
            tabIndex={mode === modeId ? 0 : -1}
            className={styles.tab}
            onClick={() => onModeChange(modeId)}
          >
            <Icon className={styles.tabIcon} aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {/* Panels stay mounted so a half-typed wish or a spin result survives switching tabs. */}
      {modes.map(({ id: modeId }) => (
        <div
          key={modeId}
          role="tabpanel"
          id={`${id}-panel-${modeId}`}
          aria-labelledby={`${id}-tab-${modeId}`}
          hidden={mode !== modeId}
          className={styles.body}
        >
          {modeId === 'assistant' && <AssistantSearch onPreview={onPreview} onChoose={onChoose} />}
          {modeId === 'manual' && <SearchForm search={search} destinationRef={destinationRef} submitRef={submitRef} />}
          {modeId === 'random' && <RandomSearch onPreview={onPreview} />}
        </div>
      ))}
    </div>
  )
}
