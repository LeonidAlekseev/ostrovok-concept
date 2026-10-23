import type { HotelSummary } from '../../lib/catalog'
import type { HotelSearch } from '../../hooks/useHotelSearch'
import type { RouteCardData } from '../../lib/routes'
import { AssistantSearch } from './AssistantSearch'

/* Liquid glass with no backing card: the globe shows through, blurred and saturated, tinted sky to mint. */
const glassFill =
  '[background:linear-gradient(150deg,color-mix(in_srgb,var(--decor-assistant-sky)_55%,transparent),color-mix(in_srgb,color-mix(in_srgb,var(--decor-assistant-sky),var(--decor-assistant-mint))_45%,transparent)_55%,color-mix(in_srgb,var(--decor-assistant-mint)_55%,transparent))]'
const glassBlur = '[backdrop-filter:blur(24px)_saturate(170%)]'
const glassRim =
  'shadow-[inset_0_1px_0_color-mix(in_srgb,var(--decor-light)_90%,transparent),inset_0_0_0_1.5px_color-mix(in_srgb,var(--decor-light)_55%,transparent),inset_0_0_32px_color-mix(in_srgb,var(--decor-light)_30%,transparent),0_20px_50px_color-mix(in_srgb,var(--shadow-color)_14%,transparent),0_2px_6px_color-mix(in_srgb,var(--shadow-color)_4%,transparent)]'
// Specular highlight along the top-left edge, painted under the content (the panel is a stacking context).
const glassSheen =
  "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:content-[''] before:[background:radial-gradient(120%_60%_at_0%_0%,color-mix(in_srgb,var(--decor-light)_50%,transparent),transparent_55%),radial-gradient(80%_50%_at_100%_100%,color-mix(in_srgb,var(--decor-light)_20%,transparent),transparent_60%)]"
const glassOpaque =
  '[@media(prefers-reduced-transparency:reduce)]:[background:var(--decor-assistant-fallback)] [@media(prefers-reduced-transparency:reduce)]:[backdrop-filter:none]'

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
    // Children that bleed to the window edge (scrolling chips) read --pad.
    <div
      data-assistant-window
      className={`relative isolate z-10 rounded-[clamp(24px,6vw,36px)] p-(--pad) [--pad:clamp(14px,3.8vw,28px)] ${glassFill} ${glassBlur} ${glassRim} ${glassSheen} ${glassOpaque}`}
    >
      <AssistantSearch newHotels={newHotels} routes={routes} onChoose={onChoose} />
    </div>
  )
}
