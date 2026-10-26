const glassRim =
  'shadow-[inset_0_1px_0_color-mix(in_srgb,var(--decor-light)_90%,transparent),inset_0_0_0_1.5px_color-mix(in_srgb,var(--decor-light)_55%,transparent),inset_0_0_32px_color-mix(in_srgb,var(--decor-light)_30%,transparent),0_20px_50px_color-mix(in_srgb,var(--shadow-color)_14%,transparent),0_2px_6px_color-mix(in_srgb,var(--shadow-color)_4%,transparent)]'
// Specular highlight along the top-left edge, painted under the content (the panel is a stacking context).
const glassSheen =
  "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:content-[''] before:[background:radial-gradient(120%_60%_at_0%_0%,color-mix(in_srgb,var(--decor-light)_50%,transparent),transparent_55%),radial-gradient(80%_50%_at_100%_100%,color-mix(in_srgb,var(--decor-light)_20%,transparent),transparent_60%)]"
const glassOpaque =
  '[@media(prefers-reduced-transparency:reduce)]:[background:var(--decor-assistant-fallback)] [@media(prefers-reduced-transparency:reduce)]:[backdrop-filter:none]'

// The home search panel: more transparent and blurred less, so the globe lies under it; rim, sheen and fallback are shared.
const searchGlassFill =
  '[background:linear-gradient(150deg,color-mix(in_srgb,var(--decor-assistant-sky)_35%,transparent),color-mix(in_srgb,color-mix(in_srgb,var(--decor-assistant-sky),var(--decor-assistant-mint))_25%,transparent)_15%,color-mix(in_srgb,var(--decor-assistant-mint)_35%,transparent))]'
const searchGlassBlur = '[backdrop-filter:blur(2px)_saturate(150%)]'
const glassChrome = `${glassRim} ${glassSheen} ${glassOpaque}`

/** The glass of the search panel on the home page; the element is `relative isolate`. */
export const searchGlassPanel = `relative isolate ${searchGlassFill} ${searchGlassBlur} ${glassChrome}`
