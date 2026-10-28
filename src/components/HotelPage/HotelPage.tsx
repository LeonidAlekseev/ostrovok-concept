import { cn } from 'cn'
import type { Hotel } from '@/lib/catalog'
import { hasGuestReviews, type HotelDetails } from '@/lib/hotelDetails'
import type { HotelNoise as HotelNoiseData } from '@/lib/noise'
import { AboutHotel, HotelAmenities } from './AboutHotel'
import { BookingCard } from './BookingCard'
import { Gallery } from './Gallery'
import { HotelAssistant, HotelAssistantProvider } from './HotelAssistant'
import { HotelierFacts } from './HotelierFacts'
import { HotelHeader } from './HotelHeader'
import { HotelLocation, LocationCard } from './HotelLocation'
import { HotelNoise } from './HotelNoise'
import { HotelRating } from './HotelRating'
import { HotelRules } from './HotelRules'
import { HotelRooms, HotelStay } from './HotelStay'
import { HotelTabs } from './HotelTabs'
import { HotelView } from './HotelView'
import { MobileBooking } from './MobileBooking'
import { MobileTopBar } from './MobileTopBar'
import { WhyGuests } from './WhyGuests'

interface Props {
  hotel: Hotel
  /** What the real hotel's Ostrovok page adds; none for a synthetic hotel. */
  details?: HotelDetails | null
  /** «Шум и окружение» of a real hotel; none for a synthetic hotel or when it could not be read. */
  noise?: HotelNoiseData | null
}

/** The white cards of the side column. */
const card = 'rounded-2xl bg-card p-5 shadow-(--shadow-card)'

/**
 * The hotel, then its photos, the sticky tabs and the sections straight on the page's background: the overview,
 * the rooms with the dates, the amenities, the guests' rating (if any), the location, the noise and the view (a real
 * hotel's) and the rules. From `lg` the booking, Эвал, the location and "Почему гости выбирают нас" stand in a sticky column on the right; below `lg`
 * the compact header shows once the name scrolls away and a button stuck to the bottom opens the booking.
 */
export function HotelPage({ hotel, details, noise }: Props) {
  return (
    <main className="flex flex-1 flex-col bg-(--decor-surface-soft)">
      <HotelStay hotel={hotel}>
        <HotelAssistantProvider hotel={hotel}>
          <MobileTopBar hotel={hotel} />
          <div className="mx-auto flex w-full max-w-(--page-max) flex-1 flex-col px-(--page-x) pt-[clamp(16px,4vw,28px)] lg:pb-12">
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_29rem]">
              <div className="flex min-w-0 flex-col gap-6">
                <HotelHeader hotel={hotel} />
                <Gallery hotel={hotel} />
                <HotelTabs
                  hotel={hotel}
                  details={details}
                  noise={Boolean(noise)}
                  view={Boolean(details)}
                  className="max-lg:top-14"
                />
                {/* Sections clear the tabs (and on a phone the compact header) when a tab scrolls to them. */}
                <div className="flex min-w-0 flex-col gap-10 [&>[id]]:scroll-mt-32 lg:[&>[id]]:scroll-mt-18">
                  <AboutHotel hotel={hotel} details={details}>
                    <WhyGuests hotel={hotel} className={cn(card, 'lg:hidden')} />
                  </AboutHotel>
                  <HotelRooms hotel={hotel} className="flex flex-col gap-4 outline-none" />
                  <HotelAmenities hotel={hotel} details={details} />
                  {hasGuestReviews(hotel, details) && <HotelRating hotel={hotel} details={details} />}
                  <HotelLocation hotel={hotel} details={details} />
                  {noise && <HotelNoise hotel={hotel} noise={noise} />}
                  {details && (
                    <HotelView hotel={hotel} building={details.building} roomFloors={details.facts.roomFloors} />
                  )}
                  <HotelierFacts hotel={hotel} />
                  <HotelRules hotel={hotel} details={details} />
                </div>
              </div>
              <aside aria-label="Бронирование" className="hidden lg:block">
                <div className="sticky top-4 flex flex-col gap-4">
                  <BookingCard hotel={hotel} className={card} />
                  <HotelAssistant className={card} />
                  <LocationCard hotel={hotel} details={details} className={card} />
                  <WhyGuests hotel={hotel} className={card} />
                </div>
              </aside>
            </div>
            <MobileBooking hotel={hotel} />
          </div>
        </HotelAssistantProvider>
      </HotelStay>
    </main>
  )
}
