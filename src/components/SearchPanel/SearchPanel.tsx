import Image from 'next/image'
import Link from 'next/link'
import { cn } from 'cn'
import { searchGlassPanel } from './glass'

/** The two ways to search; the figures are drawn to face the middle of the panel. */
const entries = [
  { href: '/assistant', label: 'Спросить Эвал', src: '/images/search-panel/robot.webp', width: 517, side: 'start' },
  { href: '/search', label: 'Искать вручную', src: '/images/search-panel/explorer.webp', width: 473, side: 'end' },
] as const

/**
 * The search of the home page: two cards on liquid glass, Eval and the manual form, each on its own page.
 * Phones stack the figure over the label, the figure rising above the panel; from md the figure stands at the
 * outer edge of its card, still taller than the panel.
 */
export function SearchPanel() {
  return (
    // [data-search-panel] bounds the globe's hotel card on phones (Hero).
    <div
      data-search-panel
      className={cn(
        searchGlassPanel,
        'grid grid-cols-2 divide-x divide-[color-mix(in_srgb,var(--decor-light)_55%,transparent)] rounded-[clamp(24px,6vw,36px)]',
      )}
    >
      {entries.map(({ href, label, src, width, side }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'group flex flex-col items-center gap-[clamp(6px,2vw,12px)] px-2 first:rounded-l-[inherit] last:rounded-r-[inherit] pb-[clamp(14px,4vw,28px)] no-underline outline-offset-[-3px] focus-visible:outline-3 focus-visible:outline-ring',
            'md:h-[clamp(176px,19vw,240px)] md:flex-row md:items-end md:justify-center md:gap-[clamp(16px,2.6vw,40px)] md:px-[clamp(12px,2vw,32px)] md:pb-0',
            side === 'end' && 'md:flex-row-reverse',
          )}
        >
          <Image
            src={src}
            alt=""
            width={width}
            height={640}
            loading="eager"
            sizes="(min-width: 768px) 270px, 40vw"
            className={cn(
              // Grows from its bottom edge on a fine pointer and on keyboard focus; transform leaves the layout as is.
              'h-[clamp(116px,36vw,272px)] w-auto flex-none origin-bottom -mt-[clamp(48px,15vw,112px)] transition-transform duration-200 ease-out motion-safe:group-hover:-translate-y-1 motion-safe:[@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-[1.06] motion-safe:group-focus-visible:scale-[1.06]',
              // From md the figure is taller than the card: aligned to its bottom, it rises above the panel.
              'md:mt-0 md:mb-[clamp(-14px,-1vw,-6px)] md:h-[clamp(212px,24vw,320px)]',
            )}
          />
          <span className="w-min text-center text-[clamp(17px,5vw,34px)] leading-[1.1] font-bold tracking-[-0.02em] text-foreground md:self-center md:text-left md:text-[clamp(26px,3.3vw,44px)]">
            {label}
          </span>
        </Link>
      ))}
    </div>
  )
}
