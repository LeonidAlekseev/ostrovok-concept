import type { RefObject } from 'react'
import { Dice5, SlidersHorizontal, Sparkles, type LucideIcon } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  return (
    <Tabs value={mode} onValueChange={(value) => onModeChange(value as SearchMode)} className={styles.panel}>
      {/* Arrow keys move focus and select the tab (WAI-ARIA automatic activation). */}
      <TabsList className={styles.tabs} aria-label="Способ поиска" activateOnFocus>
        {modes.map(({ id: modeId, label, icon: Icon }, index) => (
          <TabsTrigger
            key={modeId}
            value={modeId}
            className={`${styles.tab} group rounded-full border-0 bg-(--decor-light)/45 font-medium text-brand-foreground transition-[background-color,color,box-shadow] hover:bg-card data-active:bg-card data-active:font-[650] data-active:text-primary data-active:shadow-[0_6px_18px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]`}
          >
            {/* Only the sparkle reads well filled; the sliders and the die keep their outline. */}
            <Icon className={`${styles.tabIcon} ${index === 0 ? 'group-data-active:fill-current' : ''}`} aria-hidden />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* Panels stay mounted so a half-typed wish or a spin result survives switching tabs. */}
      {modes.map(({ id: modeId }) => (
        <TabsContent key={modeId} value={modeId} keepMounted className={styles.body}>
          {modeId === 'assistant' && <AssistantSearch onPreview={onPreview} onChoose={onChoose} />}
          {modeId === 'manual' && <SearchForm search={search} destinationRef={destinationRef} submitRef={submitRef} />}
          {modeId === 'random' && <RandomSearch onPreview={onPreview} />}
        </TabsContent>
      ))}
    </Tabs>
  )
}
