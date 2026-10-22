'use client'

import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useHotels } from '@/hooks/useHotels'
import { useBookings } from '@/hooks/useStore'
import { todayIso } from '@/lib/dates'
import { tripsIn, type TripTab } from '@/lib/trips'
import type { TripSummary } from '@/lib/trip'
import { MyPlans } from './MyPlans'
import { TripCard } from './TripCard'
import { pageClass, TripsGate } from './TripsGate'

const TABS: { value: TripTab; label: string; empty: string }[] = [
  { value: 'upcoming', label: 'Предстоящие', empty: 'Предстоящих поездок пока нет' },
  { value: 'past', label: 'Завершённые', empty: 'Завершённых поездок пока нет' },
  { value: 'cancelled', label: 'Отменённые', empty: 'Отменённых бронирований нет' },
]

function Trips() {
  const bookings = useBookings()
  const today = todayIso()
  // The hotels of all the bookings in one request; the cards wait for it rather than flash «Отель».
  const loaded = useHotels({ ids: [...new Set(bookings.map((b) => b.hotelId))] })
  const hotelOf = (id: string) => (loaded.status === 'done' ? loaded.hotels.find((h) => h.id === id) : undefined)
  return (
    <>
      <h1 className="text-title font-bold tracking-[-0.02em]">Мои поездки</h1>
      {loaded.status === 'error' && <p role="alert">{loaded.message}: показываем поездки без фото.</p>}
      <Tabs defaultValue="upcoming">
        <TabsList className="mb-4 flex w-full gap-1 border-b border-border">
          {TABS.map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="-mb-px min-w-0 flex-1 cursor-pointer whitespace-normal border-b-2 border-transparent px-1 py-2 text-sm font-medium sm:flex-none sm:px-3 sm:text-base text-muted-foreground data-active:border-primary data-active:text-foreground"
            >
              {label} ({tripsIn(bookings, value, today).length})
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(({ value, empty }) => {
          const list = tripsIn(bookings, value, today)
          return (
            <TabsContent key={value} value={value}>
              {list.length === 0 ? (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-muted-foreground">{empty}</p>
                  <Link className={buttonVariants()} href="/">
                    Найти отель
                  </Link>
                </div>
              ) : loaded.status === 'loading' ? (
                <p className="text-muted-foreground">Загружаем поездки…</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {list.map((booking) => (
                    <TripCard key={booking.id} booking={booking} hotel={hotelOf(booking.hotelId)} tab={value} />
                  ))}
                </ul>
              )}
            </TabsContent>
          )
        })}
      </Tabs>
      <p className="text-sm text-muted-foreground">
        Бронирования демонстрационные: они не привязаны к аккаунту и показываются все, что сделаны в этом браузере.
      </p>
    </>
  )
}

/** `/trips`: the user's plans (copies of routes) and the bookings of this browser in three tabs. */
export function TripsPage({ plans = [] }: { plans?: TripSummary[] | null }) {
  return (
    <main className={pageClass}>
      <TripsGate next="/trips">
        <Trips />
        <MyPlans plans={plans} />
      </TripsGate>
    </main>
  )
}
