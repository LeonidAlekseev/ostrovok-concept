import { useId, type Ref } from 'react'
import type { Hotel } from '../../lib/catalog'
import { setStayParams, type Stay } from '../../lib/search'
import { HotelTile } from '../HotelTile/HotelTile'

interface Props {
  hotels: readonly Hotel[]
  /** `null` until today's date is known: the links go without dates and the hotel page asks for them. */
  stay: Stay | null
  ref?: Ref<HTMLElement>
}

/** «Отели под настроение» of a vibe: of the vibe search and of the drawing. */
export function VibeHotels({ hotels, stay, ref }: Props) {
  const labelId = useId()
  const hrefOf = (hotel: Hotel) =>
    stay ? `/hotels/${hotel.id}?${setStayParams(new URLSearchParams(), stay)}` : `/hotels/${hotel.id}`

  return (
    <section ref={ref} aria-labelledby={labelId} tabIndex={-1} className="flex scroll-mt-4 flex-col gap-2 outline-none">
      {/* Not a heading: HotelTile goes down to h4, so the hotels stay on the level of the vibe. */}
      <p id={labelId} className="font-semibold">
        Отели под настроение
      </p>
      {/* Two columns from sm: narrower cards cut off the favourite button. */}
      <ul className="grid gap-2 sm:grid-cols-2">
        {hotels.map((hotel) => (
          <li key={hotel.id}>
            <HotelTile hotel={hotel} href={hrefOf(hotel)} heading="h4" />
          </li>
        ))}
      </ul>
    </section>
  )
}
