import { useEffect, useRef } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Hotel } from '../../lib/catalog'
import { ASPECT_LABEL, ELEMENT_LABEL, lowerFirst, MODALITY_LABEL, type Reading } from '../../lib/horoscope'
import type { RouteCardData } from '../../lib/routes'
import { setStayParams, type Stay } from '../../lib/search'
import { HotelTile } from '../HotelTile/HotelTile'
import { ReadyRoute } from '../RouteCard/ReadyRoute'
import { MagicOrb } from './MagicOrb'
import { StarVideo } from './StarVideo'

interface Props {
  reading: Reading
  /** The ready-made route over the hotels; none without routes. */
  route: RouteCardData | null
  stay: Stay
  name: string
  onRestart: () => void
}

const symbolFont = "font-['Segoe_UI_Symbol','Apple_Symbols','Noto_Sans_Symbols',sans-serif]"

export function StarResult({ reading, route, stay, name, onRestart }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { sign, moon, aspect, citySign } = reading
  const [main, ...backups] = reading.hotels
  const hrefOf = (hotel: Hotel) => `/hotels/${hotel.id}?${setStayParams(new URLSearchParams(), stay)}`
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
      <div className="flex items-center gap-4 rounded-2xl bg-(--decor-night) p-4 text-primary-foreground">
        <MagicOrb symbol={sign.symbol} className="size-18 flex-none" />
        <h3 ref={headingRef} tabIndex={-1} className="text-lg/[1.3] font-bold outline-none">
          {name}, ваш знак —{' '}
          <span className="whitespace-nowrap">
            {sign.name} <span className={symbolFont} aria-hidden>{`${sign.symbol}\uFE0E`}</span>
          </span>
        </h3>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[15px]">
        {facts.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="font-hand text-[clamp(20px,5.4vw,24px)] leading-[1.25] font-semibold text-primary">
        {reading.forecast}
      </p>

      <ReadyRoute route={route} />

      <HotelTile hotel={main} href={hrefOf(main)} heading="h4" />

      <section aria-labelledby="star-backups" className="flex flex-col gap-2">
        {/* Not a heading: HotelTile goes down to h4, so the backups stay on the level of the main hotel. */}
        <p id="star-backups" className="font-semibold">
          Запасные варианты
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {backups.map((hotel) => (
            <li key={hotel.id}>
              <HotelTile hotel={hotel} href={hrefOf(hotel)} heading="h4" />
            </li>
          ))}
        </ul>
      </section>

      <p className="text-sm text-muted-foreground">
        Гороскоп — для настроения, а не для планов. Цены и даты проверьте при бронировании.
      </p>

      <StarVideo reading={reading} name={name} />

      <Button variant="secondary" size="lg" className="h-12 text-base" onClick={onRestart}>
        <RotateCcw aria-hidden />
        Гадать заново
      </Button>
    </div>
  )
}
