import type { HotelSummary } from '../../lib/catalog'
import type { HotelSearch } from '../../hooks/useHotelSearch'
import type { RouteCardData } from '../../lib/routes'
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

interface Props {
  /** Searches for the assistant's choice: opens the results page. */
  onChoose: HotelSearch['searchFor']
  /** The "recently added" hotels the assistant suggests. */
  newHotels: readonly HotelSummary[]
  /** The routes the plan picks its ready-made one from. */
  routes: readonly RouteCardData[]
}

/** The search of the home page: the assistant on liquid glass; the manual form lives on `/search`. */
export function SearchPanel({ onChoose, newHotels, routes }: Props) {
  return (
    <div
      className={`relative z-10 rounded-[clamp(22px,5.6vw,30px)] p-[clamp(6px,2vw,10px)] ${glassFill} ${glassBlur} ${glassRim} ${glassSheen} ${glassOpaque}`}
    >
      {/* Children that bleed to the card edge (scrolling chips) read --pad. */}
      <div
        data-assistant-window
        className="rounded-[clamp(18px,4.6vw,24px)] bg-card p-(--pad) [--pad:clamp(14px,3.6vw,22px)]"
      >
        <AssistantSearch newHotels={newHotels} routes={routes} onChoose={onChoose} />
      </div>
    </div>
  )
}
