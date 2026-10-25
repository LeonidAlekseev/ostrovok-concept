import { cn } from 'cn'
import { isRated, type Hotel } from '@/lib/catalog'
import { AboutHotel, HotelAmenities } from './AboutHotel'
import { BookingCard } from './BookingCard'
import { Gallery } from './Gallery'
import { HotelAssistant, HotelAssistantProvider } from './HotelAssistant'
import { HotelHeader } from './HotelHeader'
import { HotelLocation, LocationCard } from './HotelLocation'
import { HotelRating } from './HotelRating'
import { HotelRules } from './HotelRules'
import { HotelRooms, HotelStay, type LocalStay } from './HotelStay'
import { HotelTabs } from './HotelTabs'
import { MobileBooking } from './MobileBooking'
import { MobileTopBar } from './MobileTopBar'
import { WhyGuests } from './WhyGuests'

interface Props {
  hotel: Hotel
  /** Inside a dialog: no `main` landmark, and the hotel name is an `h2` with this id to label the dialog. */
  titleId?: string
  /** Dates and guests held by the dialog instead of the address. */
  stay?: LocalStay
}

/** The white cards of the side column and of the end of the hotel dialog. */
const card = 'rounded-2xl bg-card p-5 shadow-(--shadow-card)'

/**
 * The hotel, then its photos, the sticky tabs and the sections straight on the page's background: the overview,
 * the rooms with the dates, the amenities, the guests' rating (if any), the location and the rules. From `lg`
 * the booking, Эвал, the location and "Почему гости выбирают нас" stand in a sticky column on the right; below `lg`
 * the compact header shows once the name scrolls away and a button stuck to the bottom opens the booking. The
 * hotel dialog of the search is one column with the booking card and Эвал at its end and nothing stuck to the bottom.
 */
export function HotelPage({ hotel, titleId, stay }: Props) {
  const inDialog = Boolean(titleId)
  // Sections clear the tabs (and on a phone page the compact header) when a tab scrolls to them.
  const sectionGap = cn(
    'flex min-w-0 flex-col gap-10',
    inDialog ? '[&>[id]]:scroll-mt-16' : '[&>[id]]:scroll-mt-32 lg:[&>[id]]:scroll-mt-18',
  )
  const content = (
    <HotelStay hotel={hotel} local={stay}>
      <HotelAssistantProvider hotel={hotel}>
        {!inDialog && <MobileTopBar hotel={hotel} />}
        <div
          className={cn(
            'mx-auto flex w-full flex-1 flex-col pt-[clamp(16px,4vw,28px)]',
            inDialog ? 'px-4 pb-6' : 'max-w-(--page-max) px-(--page-x) lg:pb-12',
          )}
        >
          <div
            className={cn(
              !inDialog && 'lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_23rem]',
            )}
          >
            <div className="flex min-w-0 flex-col gap-6">
              <HotelHeader hotel={hotel} titleId={titleId} />
              <Gallery hotel={hotel} />
              <HotelTabs hotel={hotel} className={cn(!inDialog && 'max-lg:top-14')} />
              <div className={sectionGap}>
                <AboutHotel hotel={hotel}>
                  <WhyGuests hotel={hotel} className={cn(card, !inDialog && 'lg:hidden')} />
                </AboutHotel>
                <HotelRooms hotel={hotel} className="flex flex-col gap-4 outline-none" />
                <HotelAmenities hotel={hotel} />
                {isRated(hotel) && <HotelRating hotel={hotel} />}
                <HotelLocation hotel={hotel} />
                <HotelRules hotel={hotel} />
                {inDialog && (
                  <>
                    <BookingCard hotel={hotel} className={card} />
                    <HotelAssistant className={card} />
                  </>
                )}
              </div>
            </div>
            {!inDialog && (
              <aside aria-label="Бронирование" className="hidden lg:block">
                <div className="sticky top-4 flex flex-col gap-4">
                  <BookingCard hotel={hotel} className={card} />
                  <HotelAssistant className={card} />
                  <LocationCard hotel={hotel} className={card} />
                  <WhyGuests hotel={hotel} className={card} />
                </div>
              </aside>
            )}
          </div>
          {!inDialog && <MobileBooking hotel={hotel} />}
        </div>
      </HotelAssistantProvider>
    </HotelStay>
  )
  if (inDialog) return content
  return <main className="flex flex-1 flex-col bg-(--decor-surface-soft)">{content}</main>
}
