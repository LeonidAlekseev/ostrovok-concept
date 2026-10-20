import type { RefObject } from 'react'
import { SlidersHorizontal, Sparkles, type LucideIcon } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Destination } from '../../data/destinations'
import type { HotelSearch } from '../../hooks/useHotelSearch'
import { SearchForm } from '../SearchForm/SearchForm'
import { AssistantSearch } from './AssistantSearch'

/* Liquid glass: the globe shows through, blurred and saturated, under a bright rim and a specular sheen. */
const glassFill =
  '[background:linear-gradient(135deg,color-mix(in_srgb,var(--decor-light)_50%,transparent),color-mix(in_srgb,var(--success-soft)_22%,transparent)_55%,color-mix(in_srgb,var(--decor-light)_32%,transparent))]'
const glassBlur = '[backdrop-filter:blur(22px)_saturate(180%)]'
const glassRim =
  'shadow-[inset_0_1px_0_color-mix(in_srgb,var(--decor-light)_90%,transparent),inset_0_-1px_0_color-mix(in_srgb,var(--decor-light)_35%,transparent),inset_0_0_0_1px_color-mix(in_srgb,var(--decor-light)_35%,transparent),inset_0_0_24px_color-mix(in_srgb,var(--decor-light)_25%,transparent),0_20px_50px_color-mix(in_srgb,var(--shadow-color)_14%,transparent),0_2px_6px_color-mix(in_srgb,var(--shadow-color)_4%,transparent)]'
// Specular highlight along the top-left edge, painted under the content (the panel is a stacking context).
const glassSheen =
  "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:content-[''] before:[background:radial-gradient(120%_60%_at_0%_0%,color-mix(in_srgb,var(--decor-light)_55%,transparent),transparent_55%),radial-gradient(80%_50%_at_100%_100%,color-mix(in_srgb,var(--decor-light)_20%,transparent),transparent_60%)]"
const glassOpaque =
  '[@media(prefers-reduced-transparency:reduce)]:[background:var(--decor-glass-fallback)] [@media(prefers-reduced-transparency:reduce)]:[backdrop-filter:none]'

export type SearchMode = 'assistant' | 'manual'

const modes: { id: SearchMode; label: string; icon: LucideIcon }[] = [
  { id: 'assistant', label: 'Ассистент', icon: Sparkles },
  { id: 'manual', label: 'Вручную', icon: SlidersHorizontal },
]

interface Props {
  mode: SearchMode
  onModeChange: (mode: SearchMode) => void
  search: HotelSearch
  destinationRef: RefObject<HTMLInputElement | null>
  submitRef: RefObject<HTMLButtonElement | null>
  /** Shows a destination on the globe without leaving the current mode. */
  onPreview: (destination: Destination) => void
  /** Searches for the assistant's choice: opens the results page. */
  onChoose: HotelSearch['searchFor']
}

export function SearchPanel({ mode, onModeChange, search, destinationRef, submitRef, onPreview, onChoose }: Props) {
  return (
    <Tabs
      value={mode}
      onValueChange={(value) => onModeChange(value as SearchMode)}
      className={`relative z-10 rounded-[clamp(22px,5.6vw,30px)] ${glassFill} ${glassBlur} ${glassRim} ${glassSheen} ${glassOpaque}`}
    >
      {/* Arrow keys move focus and select the tab (WAI-ARIA automatic activation). */}
      <TabsList
        className="grid grid-cols-2 gap-[clamp(4px,1.4vw,8px)] p-[clamp(6px,2vw,10px)]"
        aria-label="Способ поиска"
        activateOnFocus
      >
        {modes.map(({ id: modeId, label, icon: Icon }, index) => (
          <TabsTrigger
            key={modeId}
            value={modeId}
            className={`group flex h-[clamp(44px,12vw,58px)] min-w-0 items-center justify-center gap-[clamp(6px,1.8vw,12px)] px-[clamp(6px,2vw,18px)] text-[clamp(13px,3.8vw,18px)] whitespace-nowrap rounded-full border-0 bg-(--decor-light)/45 font-medium text-brand-foreground transition-[background-color,color,box-shadow] hover:bg-card data-active:bg-card data-active:font-[650] data-active:text-primary data-active:shadow-[0_6px_18px_color-mix(in_srgb,var(--shadow-color)_8%,transparent)]`}
          >
            {/* Only the sparkle reads well filled; the sliders keep their outline. */}
            <Icon
              className={`size-[clamp(18px,5vw,24px)] flex-none ${index === 0 ? 'group-data-active:fill-current' : ''}`}
              aria-hidden
            />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* Panels stay mounted so a half-typed wish or the filled form survives switching tabs. Children that bleed
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
        </TabsContent>
      ))}
    </Tabs>
  )
}
