import type { Hotel } from '@/lib/catalog'
import { AMENITY_LABEL } from '@/lib/catalog'
import { Gallery } from './Gallery'
import { HotelHeader } from './HotelHeader'
import { HotelStay } from './HotelStay'
import { Reviews } from './Reviews'

interface Props {
  hotel: Hotel
  /** Inside a dialog: no `main` landmark, and the hotel name is an `h2` with this id to label the dialog. */
  titleId?: string
}

export function HotelPage({ hotel, titleId }: Props) {
  const Root = titleId ? 'div' : 'main'
  return (
    <Root
      className={
        titleId
          ? 'flex flex-col gap-8'
          : 'mx-auto flex w-full max-w-(--page-max) flex-1 flex-col gap-8 px-(--page-x) py-[clamp(20px,5vw,40px)]'
      }
    >
      <HotelHeader hotel={hotel} titleId={titleId} />
      <Gallery hotelName={hotel.name} photos={hotel.photos} />
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
      <HotelStay hotel={hotel} />
      <Reviews rating={hotel.rating} reviewCount={hotel.reviewCount} reviews={hotel.reviews} />
    </Root>
  )
}
