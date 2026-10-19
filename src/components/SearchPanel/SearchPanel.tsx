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
    <Tabs
      value={mode}
      onValueChange={(value) => onModeChange(value as SearchMode)}
      className={`${styles.panel} relative z-10 rounded-[clamp(22px,5.6vw,30px)]`}
    >
      {/* Arrow keys move focus and select the tab (WAI-ARIA automatic activation). */}
      <TabsList
        className="grid grid-cols-3 gap-[clamp(4px,1.4vw,8px)] p-[clamp(6px,2vw,10px)]"
        aria-label="Способ поиска"
        activateOnFocus
      >
        {/* Phones (max-sm): the icon goes above the label, otherwise "Случайность" does not fit a third of the width. */}
        {modes.map(({ id: modeId, label, icon: Icon }, index) => (
          <TabsTrigger
            key={modeId}
            value={modeId}
            className={`group flex h-[clamp(44px,12vw,58px)] min-w-0 items-center justify-center gap-[clamp(6px,1.8vw,12px)] px-[clamp(6px,2vw,18px)] text-[clamp(13px,3.8vw,18px)] whitespace-nowrap max-sm:h-14 max-sm:flex-col max-sm:gap-0.5 max-sm:text-sm/[normal] rounded-full border-0 bg-(--decor-light)/45 font-medium text-brand-foreground transition-[background-color,color,box-shadow] hover:bg-card data-active:bg-card data-active:font-[650] data-active:text-primary data-active:[box-shadow:0_6px_18px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]`}
          >
            {/* Only the sparkle reads well filled; the sliders and the die keep their outline. */}
            <Icon
              className={`size-[clamp(18px,5vw,24px)] flex-none max-sm:size-5 ${index === 0 ? 'group-data-active:fill-current' : ''}`}
              aria-hidden
            />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* Panels stay mounted so a half-typed wish or a spin result survives switching tabs. Children that bleed
          to the card edge (scrolling chips) read --pad; only the outer corners are rounded, following the panel. */}
      {modes.map(({ id: modeId }) => (
        <TabsContent
          key={modeId}
          value={modeId}
          keepMounted
          className="rounded-b-[inherit] bg-card p-(--pad) animate-in fade-in slide-in-from-bottom-1 animation-duration-250 ease-out [--pad:clamp(14px,3.6vw,22px)]"
        >
          {modeId === 'assistant' && <AssistantSearch onPreview={onPreview} onChoose={onChoose} />}
          {modeId === 'manual' && <SearchForm search={search} destinationRef={destinationRef} submitRef={submitRef} />}
          {modeId === 'random' && <RandomSearch onPreview={onPreview} />}
        </TabsContent>
      ))}
    </Tabs>
  )
}
