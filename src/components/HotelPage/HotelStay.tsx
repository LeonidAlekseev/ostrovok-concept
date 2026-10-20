'use client'

import { Suspense } from 'react'
import type { Hotel } from '@/lib/catalog'
import { StayBar } from '../StayBar/StayBar'
import { DEFAULT_GUESTS } from '@/lib/search'
import { useStay, type StayState } from '../StayBar/useStay'
import { RoomList } from './RoomList'

const noDates: StayState = { stay: null, error: undefined, guests: DEFAULT_GUESTS, setStay: () => {} }

function Rooms({ hotel, state }: { hotel: Hotel; state: StayState }) {
  return (
    <section aria-labelledby="rooms-title" className="flex flex-col gap-4">
      <h2 id="rooms-title" className="text-heading font-bold">
        Номера
      </h2>
      <StayBar state={state} />
      <RoomList hotel={hotel} stay={state.stay} guests={state.guests} onPickDates={() => state.setStay({})} />
    </section>
  )
}

function Stay({ hotel }: { hotel: Hotel }) {
  return <Rooms hotel={hotel} state={useStay(hotel)} />
}

/** Dates, guests and rooms: they depend on the address, so the prerendered page shows the no-dates state. */
export function HotelStay({ hotel }: { hotel: Hotel }) {
  return (
    <Suspense fallback={<Rooms hotel={hotel} state={noDates} />}>
      <Stay hotel={hotel} />
    </Suspense>
  )
}
