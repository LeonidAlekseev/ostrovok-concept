import { ArrowRight } from 'lucide-react'
import { SmartImage } from '../ui/SmartImage'

interface Props {
  title: string
  image: string
  alt: string
  /** Lowest nightly price, already formatted. */
  price: string
  selected?: boolean
  onSelect: () => void
}

export function DestinationCard({ title, image, alt, price, selected = false, onSelect }: Props) {
  return (
    <button
      type="button"
      className="group relative isolate block aspect-[1.12] w-full snap-start overflow-hidden rounded-[clamp(14px,3.6vw,22px)] border-0 bg-brand-foreground p-0 text-left text-primary-foreground shadow-(--shadow-card) transition-[translate,box-shadow] duration-250 hover:-translate-y-[3px] hover:shadow-[0_14px_30px_color-mix(in_srgb,var(--shadow-color)_20%,transparent)] aria-pressed:shadow-[0_0_0_3px_var(--primary),0_10px_24px_color-mix(in_srgb,var(--primary)_25%,transparent)] lg:aspect-[1.4]"
      aria-pressed={selected}
      aria-label={`${title}, от ${price} — подставить в поиск`}
      onClick={onSelect}
    >
      <SmartImage
        className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
        src={image}
        alt={alt}
        loading="lazy"
        width={900}
        height={783}
      />
      <span
        className="absolute inset-0 bg-linear-180/srgb from-(--shadow-color)/0 from-42% to-(--shadow-color)/62"
        aria-hidden
      />
      <span className="absolute right-[calc(clamp(24px,6.2vw,44px)+clamp(8px,2.6vw,26px))] bottom-[clamp(9px,2.6vw,20px)] left-[clamp(8px,2.6vw,22px)] flex flex-col gap-0.5 [text-shadow:0_1px_8px_color-mix(in_srgb,var(--decor-black)_35%,transparent)]">
        <span className="text-[clamp(12px,3.15vw,24px)] leading-[1.15] font-[550] tracking-[-0.01em]">{title}</span>
        <span className="text-[clamp(11px,2.8vw,18px)] whitespace-nowrap text-(--decor-light)/85">от {price}</span>
      </span>
      <span
        className="absolute right-[clamp(6px,2vw,18px)] bottom-[clamp(6px,2vw,18px)] grid size-[clamp(24px,6.2vw,44px)] place-items-center rounded-full bg-card text-brand-foreground shadow-[0_4px_12px_color-mix(in_srgb,var(--decor-black)_18%,transparent)] transition-[translate,background-color,color] duration-250 group-hover:translate-x-0.5 group-hover:bg-primary group-hover:text-primary-foreground group-aria-pressed:bg-primary group-aria-pressed:text-primary-foreground [&_svg]:size-[62%]"
        aria-hidden
      >
        <ArrowRight size={20} strokeWidth={2.2} />
      </span>
    </button>
  )
}
