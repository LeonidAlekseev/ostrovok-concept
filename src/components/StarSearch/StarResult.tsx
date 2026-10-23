import { useEffect, useRef } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ASPECT_LABEL, ELEMENT_LABEL, lowerFirst, MODALITY_LABEL, type Reading } from '../../lib/horoscope'
import type { Hotel } from '../../lib/catalog'
import { hotelHref, type Stay } from '../../lib/search'
import Link from 'next/link'
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder'
import { formatDecimal, formatPrice } from '../../lib/format'
import { useDestination } from '../Catalog/useDestinations'
import { MagicOrb } from './MagicOrb'
import type { StarPick } from './starVideo'
import { StarVideo } from './StarVideo'

interface Props {
  reading: Reading
  /** The dates of the reading, for the hotel's link. */
  stay: Stay
  name: string
  onRestart: () => void
}

const symbolFont = "font-['Segoe_UI_Symbol','Apple_Symbols','Noto_Sans_Symbols',sans-serif]"

export function StarResult({ reading, stay, name, onRestart }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { sign, moon, aspect, citySign } = reading
  // The stars' hotel: of their city, or of the next one when theirs has none.
  const [hotel] = reading.hotels
  const city = useDestination(hotel?.destinationId ?? '') ?? reading.city
  // What the video and the message tell.
  const pick: StarPick = {
    title: hotel?.name ?? reading.city.name,
    place: `${city.name}, ${city.country}`,
    estimate: hotel ? `от ${formatPrice(hotel.priceFrom)} за ночь` : '',
  }
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

      {hotel && <StarHotel hotel={hotel} place={pick.place} href={hotelHref(hotel.id, stay)} />}

      <p className="text-sm text-(--decor-star-muted)">
        Гороскоп — для настроения, а не для планов. Цены и даты проверьте при бронировании.
      </p>

      <StarVideo reading={reading} name={name} pick={pick} />

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

/** The stars' hotel: a card of the window's glass in a golden line, a link to the hotel's page. */
function StarHotel({ hotel, place, href }: { hotel: Hotel; place: string; href: string }) {
  return (
    <section aria-labelledby="star-hotel" className="flex flex-col gap-2.5">
      {/* Not a heading: the result's heading is h3, the hotel's name is h4. */}
      <p id="star-hotel" className="font-star text-lg font-semibold text-(--decor-gold)">
        Звёзды выбрали отель
      </p>
      <Link
        href={href}
        className="group flex flex-col overflow-hidden rounded-3xl border border-(--decor-gold)/45 bg-(--decor-star-glass) shadow-[0_16px_48px_color-mix(in_srgb,var(--decor-violet)_35%,transparent)] transition-[border-color,translate] duration-200 outline-none hover:-translate-y-0.5 hover:border-(--decor-gold) focus-visible:ring-3 focus-visible:ring-(--decor-gold)/70"
      >
        <PhotoPlaceholder photo={hotel.photos[0]} className="aspect-[16/9] w-full" />
        <span className="flex flex-col gap-1.5 p-[clamp(14px,4vw,20px)]">
          <h4 className="font-star text-[clamp(19px,5vw,22px)]/[1.25] font-semibold text-(--decor-star-text) group-hover:text-(--decor-gold)">
            {hotel.name}
          </h4>
          <span className="text-sm text-(--decor-star-muted)">{place}</span>
          <span className="text-sm text-(--decor-star-muted)">
            Оценка гостей: <span className="font-medium text-(--decor-star-text)">{formatDecimal(hotel.rating)}</span>
          </span>
          <span className="mt-1 bg-(image:--decor-gold-gradient) bg-clip-text text-lg font-bold text-transparent">
            от {formatPrice(hotel.priceFrom)} за ночь
          </span>
        </span>
      </Link>
    </section>
  )
}
