import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { cn } from 'cn'
import { Button, buttonVariants } from '@/components/ui/button'
import { ASPECT_LABEL, ELEMENT_LABEL, lowerFirst, MODALITY_LABEL, type Reading } from '../../lib/horoscope'
import { selectionHref, type Stay } from '../../lib/search'
import { MagicOrb } from './MagicOrb'
import { StarVideo } from './StarVideo'

interface Props {
  reading: Reading
  /** The dates of the reading, for the link to the selection. */
  stay: Stay
  name: string
  onRestart: () => void
}

const symbolFont = "font-['Segoe_UI_Symbol','Apple_Symbols','Noto_Sans_Symbols',sans-serif]"

export function StarResult({ reading, stay, name, onRestart }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { sign, moon, aspect, citySign } = reading
  const facts = [
    ['Стихия', `${ELEMENT_LABEL[sign.element]}, ${MODALITY_LABEL[sign.modality]} знак, управитель — ${sign.ruler}`],
    ['Луна', `${moon.sign.name}, ${lowerFirst(moon.phase.name)}`],
    ['Солнце в поездке', reading.sunTransit.name],
    [
      'Главный аспект',
      `${aspect ? ASPECT_LABEL[aspect] : 'Нет мажорного аспекта'}: ${sign.name} и ${citySign.name} — знак города ${reading.city.name}`,
    ],
  ]

  // The form is gone: the focus moves to the result.
  useEffect(() => headingRef.current?.focus(), [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 rounded-3xl border border-(--decor-gold)/35 bg-(--decor-star-glass) p-4">
        <MagicOrb symbol={sign.symbol} className="size-20 flex-none" />
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="bg-(image:--decor-gold-gradient) bg-clip-text font-star text-[clamp(20px,5.4vw,24px)]/[1.25] font-semibold text-transparent outline-none"
        >
          {name}, ваш знак —{' '}
          <span className="whitespace-nowrap">
            {sign.name} <span className={symbolFont} aria-hidden>{`${sign.symbol}\uFE0E`}</span>
          </span>
        </h3>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[15px]">
        {facts.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-(--decor-star-muted)">{term}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="font-hand text-[clamp(22px,5.8vw,26px)] leading-[1.25] font-semibold text-(--decor-gold)">
        {reading.forecast}
      </p>

      {/* The stars' hotels are shown on /search, with its filters and map. */}
      <Link
        href={selectionHref({ hotels: reading.hotels.map((h) => h.id), from: 'stars', pick: sign.id }, stay)}
        className={cn(
          buttonVariants({ size: 'lg' }),
          'h-12 bg-(image:--decor-star-choice) text-base text-(--decor-star-text) shadow-(--decor-spin-shadow) hover:bg-(image:--decor-star-choice) hover:brightness-110',
        )}
      >
        Посмотреть подборку
        <ArrowRight aria-hidden />
      </Link>

      <p className="text-sm text-(--decor-star-muted)">Гороскоп — для настроения, а не для планов.</p>

      <StarVideo reading={reading} name={name} />

      <Button
        variant="outline"
        size="lg"
        className="h-12 border-(--decor-star-line)/70 bg-(--decor-star-glass) text-base text-(--decor-star-text) hover:bg-(--decor-star-glass) hover:text-(--decor-gold)"
        onClick={onRestart}
      >
        <RotateCcw aria-hidden />
        Гадать заново
      </Button>
    </div>
  )
}
