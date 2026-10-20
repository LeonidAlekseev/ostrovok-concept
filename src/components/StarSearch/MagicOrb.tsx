import { cn } from 'cn'

interface Props {
  /** Zodiac symbol that surfaces from the nebula. */
  symbol?: string
  /** The stars are being read: the colours swirl fast and the symbol appears over 2.5 s. */
  active?: boolean
  className?: string
}

// Sparkles around the orb; each twinkles with its own delay.
const sparkles = [
  { at: 'top-[2%] left-[16%] size-2.5', delay: '0s' },
  { at: 'top-[12%] right-[2%] size-1.5', delay: '0.5s' },
  { at: 'top-[48%] -right-[6%] size-2', delay: '1.1s' },
  { at: 'bottom-[6%] right-[14%] size-3', delay: '0.3s' },
  { at: 'bottom-[0%] left-[22%] size-1.5', delay: '0.8s' },
  { at: 'top-[40%] -left-[7%] size-2.5', delay: '1.4s' },
]

/**
 * A crystal ball: a conic swirl of the brand colours shimmers under a glass highlight. Decorative; under
 * reduced motion the global rule stops every animation, so the orb stands still and the symbol is shown.
 */
export function MagicOrb({ symbol, active = false, className }: Props) {
  return (
    <div className={cn('@container relative aspect-square', className)} aria-hidden>
      <div className="absolute -inset-[18%] animate-orb-glow rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--decor-violet)_55%,transparent),transparent_68%)]" />
      <div className="absolute inset-0 overflow-hidden rounded-full shadow-(--decor-orb-shadow)">
        <div
          className={`absolute -inset-1/4 bg-(image:--decor-orb-swirl) blur-xl ${active ? 'animate-orb-swirl-fast' : 'animate-orb-swirl'}`}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_62%_68%,var(--decor-magenta),transparent_58%)] opacity-60 mix-blend-screen" />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_26%,color-mix(in_srgb,var(--decor-light)_70%,transparent),transparent_36%)] inset-shadow-[0_-12px_30px_color-mix(in_srgb,var(--decor-night)_45%,transparent)]" />
      </div>
      {symbol && (
        <span
          key={String(active)}
          className={`absolute inset-0 grid place-items-center font-['Segoe_UI_Symbol','Apple_Symbols','Noto_Sans_Symbols',sans-serif] text-[48cqw] leading-none text-(--decor-light) [text-shadow:0_0_6cqw_var(--decor-gold)] ${active ? 'animate-orb-reveal' : ''}`}
        >
          {/* Text presentation: the emoji variants of the zodiac glyphs ignore the colour. */}
          {`${symbol}\uFE0E`}
        </span>
      )}
      {sparkles.map(({ at, delay }) => (
        <span
          key={at}
          className={`absolute ${at} animate-twinkle rounded-full bg-(--decor-gold) shadow-[0_0_8px_var(--decor-gold)]`}
          style={{ animationDelay: delay }}
        />
      ))}
    </div>
  )
}
