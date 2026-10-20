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

const block = 'rounded-2xl bg-card p-[clamp(16px,4vw,24px)]'

/**
 * One centred column of white blocks on every screen: the photos, the hotel, the dates, the hotel's
 * description, the rooms and the reviews, with the price bar stuck to the bottom.
 */
export function HotelPage({ hotel, titleId, stay }: Props) {
  const column = (
    <div className={cn('mx-auto flex w-full max-w-2xl flex-col gap-3', !titleId && 'px-(--page-x) pt-3 sm:pt-6')}>
      <Gallery hotel={hotel} />
      <HotelHeader hotel={hotel} titleId={titleId} className={block} />
      <HotelStay hotel={hotel} local={stay}>
        <StayDates hotel={hotel} className={block} />
        <section aria-labelledby="about-title" className={cn('flex flex-col gap-3', block)}>
          <h2 id="about-title" className="text-heading font-bold">
            Об отеле
          </h2>
          <p>{hotel.description}</p>
          <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2" aria-label="Удобства">
            {hotel.amenities.map((amenity) => (
              <li key={amenity}>{AMENITY_LABEL[amenity]}</li>
            ))}
          </ul>
        </section>
        <HotelRooms hotel={hotel} className={cn('flex scroll-mt-3 flex-col gap-4 outline-none', block)} />
        <Reviews
          rating={hotel.rating}
          reviewCount={hotel.reviewCount}
          reviews={hotel.reviews}
          className={cn('scroll-mt-3 outline-none', block)}
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
