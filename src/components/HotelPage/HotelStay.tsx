'use client'

import { Suspense, type ReactNode } from 'react'
import type { Hotel } from '@/lib/catalog'
import type { Stay } from '@/lib/search'
import { useLocalStay, useStay } from '../StayBar/useStay'
import { RoomList } from './RoomList'
import { noDates, StayContext, useHotelStay } from './stayContext'

function AddressStay({ hotel, children }: { hotel: Hotel; children: ReactNode }) {
  return <StayContext value={useStay(hotel)}>{children}</StayContext>
}

/** The stay the caller holds (the hotel dialog); nothing is written to the address. */
export interface LocalStay {
  value: Stay
  onChange: (next: Stay) => void
}

function LocalStays({ hotel, local, children }: { hotel: Hotel; local: LocalStay; children: ReactNode }) {
  return <StayContext value={useLocalStay(hotel, local.value, local.onChange)}>{children}</StayContext>
}

/**
 * Gives the blocks inside it the dates and guests. They depend on the address, so the prerendered
 * page shows the no-dates state. With `local` they come from the caller instead.
 */
export function HotelStay({ hotel, local, children }: { hotel: Hotel; local?: LocalStay; children: ReactNode }) {
  if (local)
    return (
      <LocalStays hotel={hotel} local={local}>
        {children}
      </LocalStays>
    )
  return (
    <Suspense fallback={<StayContext value={noDates}>{children}</StayContext>}>
      <AddressStay hotel={hotel}>{children}</AddressStay>
    </Suspense>
  )
}

/** The rooms for the stay; "Выбрать номер" of the price bar leads here. */
export function HotelRooms({ hotel, className }: { hotel: Hotel; className?: string }) {
  const { stay, guests, setStay } = useHotelStay()
  return (
    <section id="rooms" tabIndex={-1} aria-labelledby="rooms-title" className={className}>
      <h2 id="rooms-title" className="text-heading font-bold">
        Номера
      </h2>
      <RoomList hotel={hotel} stay={stay} guests={guests} onPickDates={() => setStay({})} />
    </section>
  )
}
