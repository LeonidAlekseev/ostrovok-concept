'use client'

import { Suspense } from 'react'
import type { Hotel } from '@/lib/catalog'
import { StayBar } from '../StayBar/StayBar'
import { DEFAULT_GUESTS, type Stay } from '@/lib/search'
import { useLocalStay, useStay, type StayState } from '../StayBar/useStay'
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

/** The stay the caller holds (the hotel dialog); nothing is written to the address. */
export interface LocalStay {
  value: Stay
  onChange: (next: Stay) => void
}

function LocalStays({ hotel, local }: { hotel: Hotel; local: LocalStay }) {
  return <Rooms hotel={hotel} state={useLocalStay(hotel, local.value, local.onChange)} />
}

/**
 * Dates, guests and rooms: they depend on the address, so the prerendered page shows the no-dates state.
 * With `local` they come from the caller instead.
 */
export function HotelStay({ hotel, local }: { hotel: Hotel; local?: LocalStay }) {
  if (local) return <LocalStays hotel={hotel} local={local} />
  return (
    <Suspense fallback={<Rooms hotel={hotel} state={noDates} />}>
      <Stay hotel={hotel} />
    </Suspense>
  )
}
