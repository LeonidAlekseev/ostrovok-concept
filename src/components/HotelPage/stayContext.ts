'use client'

import { createContext, use } from 'react'
import { DEFAULT_GUESTS } from '@/lib/search'
import type { StayState } from '../StayBar/useStay'

/** The state of the prerendered page: no dates yet, the default couple. */
export const noDates: StayState = { stay: null, error: undefined, guests: DEFAULT_GUESTS, setStay: () => {} }

export const StayContext = createContext<StayState>(noDates)

/** Dates and guests of the hotel page for its stay blocks: the dates, the rooms and the price bar. */
export const useHotelStay = () => use(StayContext)
