import { useId } from 'react'
import type { Hotel } from '../../lib/catalog'
import { hotelHref, type Stay } from '../../lib/search'
import { HotelTile } from '../HotelTile/HotelTile'

interface Props {
  hotels: readonly Hotel[]
  /** `null` until today's date is known: the links go without dates and the hotel page asks for them. */
  stay: Stay | null
}

/** «Отели под настроение» of a vibe: of the vibe search and of the drawing. */
export function VibeHotels({ hotels, stay }: Props) {
  const labelId = useId()

  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-2">
      {/* Not a heading: HotelTile goes down to h4, so the hotels stay on the level of the vibe. */}
      <p id={labelId} className="font-semibold">
        Отели под настроение
      </p>
      {/* Two columns from sm: narrower cards cut off the favourite button. */}
      <ul className="grid gap-2 sm:grid-cols-2">
        {hotels.map((hotel) => (
          <li key={hotel.id}>
            <HotelTile hotel={hotel} href={hotelHref(hotel.id, stay)} heading="h4" />
          </li>
        ))}
      </ul>
    </section>
  )
}
