'use client'

import { Suspense } from 'react'
import type { Hotel } from '@/lib/catalog'
import { StayBar } from '../StayBar/StayBar'
import { DEFAULT_GUESTS, useStay, type StayState } from '../StayBar/useStay'
import { RoomRates } from './RoomRates'

const noDates: StayState = { stay: null, error: undefined, guests: DEFAULT_GUESTS, setStay: () => {} }

function Rates({ hotel, state }: { hotel: Hotel; state: StayState }) {
  return (
    <div className="flex flex-col gap-6">
      <StayBar state={state} />
      {hotel.rooms.map((room) => (
        <RoomRates
          key={room.id}
          hotel={hotel}
          room={room}
          stay={state.stay}
          guests={state.guests}
          onPickDates={() => state.setStay({})}
        />
      ))}
    </div>
  )
}

function Stay({ hotel }: { hotel: Hotel }) {
  return <Rates hotel={hotel} state={useStay(hotel)} />
}

/** Rooms and rates for the stay in the address; the prerendered page shows per-night prices. */
export function RatesView({ hotel }: { hotel: Hotel }) {
  return (
    <Suspense fallback={<Rates hotel={hotel} state={noDates} />}>
      <Stay hotel={hotel} />
    </Suspense>
  )
}
