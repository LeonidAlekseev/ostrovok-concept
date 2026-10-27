'use client'

import { Suspense, type ReactNode } from 'react'
import type { Hotel } from '@/lib/catalog'
import { useStay } from '../StayBar/useStay'
import { RoomList } from './RoomList'
import { StayDates } from './StayDates'
import { noDates, StayContext, useHotelStay } from './stayContext'

function AddressStay({ hotel, children }: { hotel: Hotel; children: ReactNode }) {
  return <StayContext value={useStay(hotel)}>{children}</StayContext>
}

/**
 * Gives the blocks inside it the dates and guests. They depend on the address, so the prerendered
 * page shows the no-dates state.
 */
export function HotelStay({ hotel, children }: { hotel: Hotel; children: ReactNode }) {
  return (
    <Suspense fallback={<StayContext value={noDates}>{children}</StayContext>}>
      <AddressStay hotel={hotel}>{children}</AddressStay>
    </Suspense>
  )
}

/** "Номера": the dates and guests of the stay, then its rooms; "Забронировать" of the booking card leads here. */
export function HotelRooms({ hotel, className }: { hotel: Hotel; className?: string }) {
  const { stay, guests, setStay } = useHotelStay()
  return (
    <section id="rooms" tabIndex={-1} aria-labelledby="rooms-title" className={className}>
      <h2 id="rooms-title" className="text-heading font-bold">
        Номера
      </h2>
      <StayDates hotel={hotel} />
      <RoomList hotel={hotel} stay={stay} guests={guests} onPickDates={() => setStay({})} />
    </section>
  )
}
