import { cn } from 'cn'
import type { Hotel } from '@/lib/catalog'
import { AMENITY_LABEL } from '@/lib/catalog'
import { Gallery } from './Gallery'
import { HotelHeader } from './HotelHeader'
import { HotelRooms, HotelStay, type LocalStay } from './HotelStay'
import { PriceBar } from './PriceBar'
import { Reviews } from './Reviews'
import { StayDates } from './StayDates'

interface Props {
  hotel: Hotel
  /** Inside a dialog: no `main` landmark, and the hotel name is an `h2` with this id to label the dialog. */
  titleId?: string
  /** Dates and guests held by the dialog instead of the address. */
  stay?: LocalStay
}

/**
 * Text and headings straight on the page's background: the hotel with its photos, the dates, the
 * hotel's description, the rooms and the reviews, with the price bar stuck to the bottom.
 */
export function HotelPage({ hotel, titleId, stay }: Props) {
  const column = (
    <div
      className={cn(
        'mx-auto flex w-full flex-1 flex-col gap-8',
        !titleId && 'max-w-(--page-max) px-(--page-x) pt-[clamp(20px,5vw,40px)]',
      )}
    >
      <HotelStay hotel={hotel} local={stay}>
        <HotelHeader hotel={hotel} titleId={titleId}>
          <Gallery hotel={hotel} />
        </HotelHeader>
        <StayDates hotel={hotel} />
        <section aria-labelledby="about-title" className="flex flex-col gap-3">
          <h2 id="about-title" className="text-heading font-bold">
            Об отеле
          </h2>
          <p className="max-w-3xl">{hotel.description}</p>
          <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Удобства">
            {hotel.amenities.map((amenity) => (
              <li key={amenity}>{AMENITY_LABEL[amenity]}</li>
            ))}
          </ul>
        </section>
        <HotelRooms hotel={hotel} className="flex scroll-mt-3 flex-col gap-4 outline-none" />
        <Reviews
          rating={hotel.rating}
          reviewCount={hotel.reviewCount}
          reviews={hotel.reviews}
          className="scroll-mt-3 outline-none"
        />
        <PriceBar
          hotel={hotel}
          className={cn('mt-auto rounded-t-2xl px-[clamp(16px,4vw,24px)] py-3', !titleId && 'max-sm:-mx-(--page-x)')}
        />
      </HotelStay>
    </div>
  )
  if (titleId) return column
  return <main className="flex flex-1 flex-col bg-(--decor-surface-soft)">{column}</main>
}
