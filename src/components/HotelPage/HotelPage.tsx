import { cn } from 'cn'
import type { Hotel } from '@/lib/catalog'
import { AboutHotel } from './AboutHotel'
import { Gallery } from './Gallery'
import { HotelHeader } from './HotelHeader'
import { HotelRating } from './HotelRating'
import { HotelRooms, HotelStay, type LocalStay } from './HotelStay'
import { PriceBar } from './PriceBar'
import { StayDates } from './StayDates'

interface Props {
  hotel: Hotel
  /** Inside a dialog: no `main` landmark, and the hotel name is an `h2` with this id to label the dialog. */
  titleId?: string
  /** Dates and guests held by the dialog instead of the address. */
  stay?: LocalStay
}

/**
 * The large photo with its thumbnails (under the transparent header on the page, at the top of the
 * dialog), then text and headings straight on the page's background: the hotel, the guests' rating,
 * the dates, the hotel's description and amenities and the rooms, with the price bar stuck to the bottom.
 */
export function HotelPage({ hotel, titleId, stay }: Props) {
  const content = (
    <HotelStay hotel={hotel} local={stay}>
      <Gallery hotel={hotel} inDialog={Boolean(titleId)} />
      <div
        className={cn(
          'mx-auto flex w-full flex-1 flex-col gap-8 pt-[clamp(16px,4vw,28px)]',
          titleId ? 'px-4' : 'max-w-(--page-max) px-(--page-x)',
        )}
      >
        <HotelHeader hotel={hotel} titleId={titleId} />
        <HotelRating hotel={hotel} />
        <StayDates hotel={hotel} />
        <AboutHotel hotel={hotel} />
        <HotelRooms hotel={hotel} className="flex scroll-mt-3 flex-col gap-4 outline-none" />
        <PriceBar
          hotel={hotel}
          className={cn('mt-auto rounded-t-2xl px-[clamp(16px,4vw,24px)] py-3', !titleId && 'max-sm:-mx-(--page-x)')}
        />
      </div>
    </HotelStay>
  )
  if (titleId) return content
  // The photo starts under the header, which is transparent over it.
  return <main className="-mt-(--header-height) flex flex-1 flex-col bg-(--decor-surface-soft)">{content}</main>
}
